import { queue } from "async";
import * as kafka from "kafka-node";
import { CollectionInsertManyOptions } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("scriptorium:kafkaClientId");
const topic = nconf.get("scriptorium:topic");
const groupId = nconf.get("scriptorium:groupId");
const checkpointBatchSize = nconf.get("scriptorium:checkpointBatchSize");
const mongoUrl = nconf.get("mongo:endpoint");
const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");

async function run() {
    const deferred = new utils.Deferred<void>();

    let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
    io.redis.on("error", (error) => {
        deferred.reject(error);
    });

    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const db = await mongoManager.getDatabase();
    const collection = db.collection(deltasCollectionName);
    await collection.createIndex({
            "objectId": 1,
            "operation.sequenceNumber": 1,
        },
        { unique: true });

    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);

    // Validate the required topics exist
    await utils.kafka.ensureTopics(kafkaClient, [topic]);

    const consumerOffset = new kafka.Offset(kafkaClient);
    const partitionManager = new core.PartitionManager(groupId, topic, consumerOffset, checkpointBatchSize);

    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [{topic}], <any> {
        autoCommit: false,
        fetchMaxBytes: 1024 * 1024,
        fetchMinBytes: 1,
        fromOffset: true,
        groupId,
        id: kafkaClientId,
        maxTickMessages: 100000,
    });

    const throughput = new utils.ThroughputCounter();

    highLevelConsumer.on("error", (error) => {
        // Workaround to resolve rebalance partition error.
        // https://github.com/SOHU-Co/kafka-node/issues/90
        console.error(`Error in kafka consumer: ${error}. Wait for 30 seconds and restart...`);
        setTimeout(() => {
            deferred.reject(error);
        }, 30000);
    });

    const ioBatchManager = new utils.BatchManager<core.ISequencedOperationMessage>((objectId, work) => {
        // console.log(`Inserting to mongodb ${value.objectId}@${value.operation.sequenceNumber}`);
        collection.insertMany(work, <CollectionInsertManyOptions> (<any> { ordered: false })).catch((error) => {
            // Ignore duplicate key errors since a replay may cause us to attempt to insert a second time
            if (error.name !== "MongoError" || error.code !== 11000) {
                deferred.reject(error);
            }
        });

        // Route the message to clients
        // console.log(`Routing message to clients ${value.objectId}@${value.operation.sequenceNumber}`);
        io.to(objectId).emit("op", objectId, work.map((value) => value.operation));

        throughput.acknolwedge(work.length);
    });

    const q = queue((message: any, callback) => {
        // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
        // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.

        const baseMessage = JSON.parse(message.value) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;

            // Batch up work to more efficiently send to socket.io and mongodb
            ioBatchManager.add(value.objectId, value);
        }

        // Update partition manager.
        partitionManager.update(message.partition, message.offset);

        // Checkpoint to kafka after completing all operations.
        // We should experiment with 'CheckpointBatchSize' here.
        if (message.offset % checkpointBatchSize === 0) {
            // Finally call kafka checkpointing.
            partitionManager.checkPoint();
        }

        callback();
    }, 1);

    highLevelConsumer.on("message", async (message: any) => {
        throughput.produce();
        q.push(message);
    });

    return deferred.promise;
}

// Start up the scriptorium service
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
