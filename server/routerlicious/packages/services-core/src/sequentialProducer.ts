/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITicketedMessage } from "./messages";
import { IProducer } from "./queue";

/**
 * Combines multiple producers to one.
 * This produces messages to each producer one after another (in order of the constructor)
 * It will wait for each send to complete before sending the message to the next producer
 */
export class SequentialProducer<T = ITicketedMessage> implements IProducer<T> {
    constructor(private readonly producers: IProducer<T>[]) {
    }

    /**
     * Returns true if the producer is connected
     */
    public isConnected(): boolean {
        return this.producers.every((producer) => producer.isConnected());
    }

    public async send(messages: T[], tenantId: string, documentId: string): Promise<void> {
        for (const producer of this.producers) {
            await producer.send(messages, tenantId, documentId);
        }
    }

    public async close(): Promise<void> {
        const closeP = [];
        for (const producer of this.producers) {
            closeP.push(producer.close());
        }
        await Promise.all(closeP);
    }

    public on(_event: "connected" | "produced" | "error", _listener: (...args: any[]) => void): this {
        return this;
    }

    public once(_event: "connected" | "produced" | "error", _listener: (...args: any[]) => void): this {
        return this;
    }
}
