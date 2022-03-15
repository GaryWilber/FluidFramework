/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { RawOperationType } from ".";

import { IRawOperationMessage, ISequencedOperationMessage, ITicketedMessage, SequencedOperationType } from "./messages";
import { IPendingBoxcar } from "./queue";

// 1MB batch size / (16KB max message size + overhead)
export const MaxBatchSize = 32;

// estimated size of an empty boxcar
const emptyBoxcarSize = 128;

// estimated size of an empty raw operation (empty contents)
const emptyRawOperationSize = 384;

// estimated size of an empty raw sequenced operation (empty contents)
const emptySequencedOperationSize = 384;

export class PendingBoxcar implements IPendingBoxcar<ITicketedMessage> {

    /**
     * Estimates ticketed message sizes
     * @returns estimated size in bytes of the message
     */
    public static getEstimatedMessageSize(message: ITicketedMessage): number {
        let size = emptyBoxcarSize;

        switch (message.type) {
            case RawOperationType: {
                size += emptyRawOperationSize;

                const operation = (message as IRawOperationMessage).operation;

                if (typeof (operation.contents) === "string") {
                    size += operation.contents.length;
                }

                break;
            }

            case SequencedOperationType: {
                size += emptySequencedOperationSize;

                const operation = (message as ISequencedOperationMessage).operation;

                if (typeof (operation.contents) === "string") {
                    size += operation.contents.length;
                }

                break;
            }

            default:
                // unknown message type
                return emptyBoxcarSize;
        }

        return size;
    }

    /**
     * Estimated total size of this boxcar in bytes
     */
    public size: number = 0;

    /**
     * Promise that will resolve/reject when the boxcar is produced
     */
    public deferred = new Deferred<void>();

    /**
     * Messages included in this boxcar
     */
    public messages: ITicketedMessage[] = [];

    /**
     * Optional partition id to send this boxcar too.
     * Usually not used since we send messages based on the tenant/document id.
     */
    public partitionId?: number;

    constructor(public tenantId: string, public documentId: string) {
    }

    /**
     * Adds messages to a boxcar
     * @param messages Messages to add
     */
    public addMessages(messages: ITicketedMessage[]) {
        this.messages.push(...messages);

        for (const message of messages) {
            this.size += PendingBoxcar.getEstimatedMessageSize(message);
        }
    }

}
