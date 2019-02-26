import * as api from "@prague/client-api";
import { ISharedMap } from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { ContanierUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as Sequence from "@prague/sequence";
import * as childProcess from "child_process";
import * as path from "path";
import * as author from "./author";

let document: api.Document;
let sharedString: Sequence.SharedString;

function setParagraphs(chunks: string[]) {
    let props;
    for (let c = 0; c < chunks.length; c++) {
        props = {
            [MergeTree.reservedMarkerIdKey]: ["p-" + c],
            [MergeTree.reservedTileLabelsKey]: ["pg"],
        };
        sharedString.insertMarker(c, MergeTree.ReferenceType.Tile, props);
    }

    // Insert final pg marker. All text must be before a pg marker or it won't display!
    props = {
        [MergeTree.reservedMarkerIdKey]: ["p-final"],
        [MergeTree.reservedTileLabelsKey]: ["pg"],
    };
    sharedString.insertMarker(chunks.length, MergeTree.ReferenceType.Tile, props);
}

function getParagraphs() {
    const root = document.getRoot();
    const chunksMap = root.get("chunks");
    if (chunksMap) {
        for (const key of chunksMap.keys()) {
            console.log(key + ": " + chunksMap.get(key));
        }
    }
}

async function setChunkMap(chunks: string[]) {
    let c = 0;
    const root = await document.getRoot();
    const chunkMap = root.get("chunks") as ISharedMap;

    if (chunks) {
        for (const chunk of chunks) {
            const chunkKey = "p-" + c;
            if (chunk !== "") {
                chunkMap.set(chunkKey, chunk);
            }
            c++;
        }
    }
}

async function conductor(
    resolver: ContanierUrlResolver,
    text,
    intervalTime,
    writers,
    processes,
    documentToken: string,
    metricsToken: string,
    callback): Promise<author.IScribeMetrics> {

    const process = 0;
    const docId = "";
    const chunks = author.normalizeText(text).split("\n");

    if (processes === 1) {
        return await author.typeFile(
            document,
            resolver,
            sharedString,
            text,
            intervalTime,
            writers,
            documentToken,
            metricsToken,
            callback);
    }

    const interval = setInterval(() => {
        const args = [docId, intervalTime, chunks.length, process];
        childProcess.fork(__dirname + path.sep + "author.js", args);
        if (process >= processes) {
            clearInterval(interval);
        }
    }, 500);
}

export async function create(
    id: string,
    resolver: ContanierUrlResolver,
    token: string,
    text: string,
    debug = false): Promise<void> {

    // Load the shared string extension we will type into
    const tokenService = new socketStorage.TokenService();
    const claims = tokenService.extractClaims(token);

    document = await api.load(
        id,
        claims.tenantId,
        {
            resolver,
            tokenProvider: new socketStorage.TokenProvider(token),
        },
        {});
    const root = await document.getRoot();

    root.set("presence", document.createMap());
    root.set("users", document.createMap());
    sharedString = document.createString() as Sequence.SharedString;
    root.set("calendar", undefined, Sequence.SharedIntervalCollectionValueType.Name);
    const seq = document.create(Sequence.SharedNumberSequenceExtension.Type) as
        Sequence.SharedNumberSequence;
    root.set("sequence-test", seq);

    // p-start might break something
    sharedString.insertMarker(0, MergeTree.ReferenceType.Tile, { [MergeTree.reservedTileLabelsKey]: ["pg"] });
    root.set("text", sharedString);
    root.set("ink", document.createMap());

    await root.set("chunks", document.createMap());

    const chunks = author.normalizeText(text).split("\n");
    setParagraphs(chunks);
    await setChunkMap(chunks);
    if (debug) {
        getParagraphs();
    }

    return Promise.resolve();
}

export async function type(
    intervalTime: number,
    text: string,
    writers: number,
    processes: number,
    documentToken: string,
    metricsToken: string,
    resolver: ContanierUrlResolver,
    callback: author.ScribeMetricsCallback,
    distributed = false): Promise<author.IScribeMetrics> {

    if (distributed) {
        console.log("distributed");
    }
    return conductor(
        resolver,
        text,
        intervalTime,
        writers,
        processes,
        documentToken,
        metricsToken,
        callback);
}

/**
 * Toggle between play and pause.
 */
export function togglePlay() {
    author.toggleAuthorPlay();
}
