/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fetchHelper, IOdspResponse } from "./OdspUtils";

export interface IFetchWrapper {
    get<T>(url: string, id: string, headers: HeadersInit): Promise<IOdspResponse<T>>;
    post<T>(url: string, postBody: string, headers: HeadersInit): Promise<IOdspResponse<T>>;
}

/**
 * Get responses with retry for requests.
 */
export class FetchWrapper implements IFetchWrapper {
    public get<T>(url: string, _: string, headers: HeadersInit): Promise<IOdspResponse<T>> {
        return fetchHelper(url, { headers });
    }

    public post<T>(url: string, postBody: string, headers: HeadersInit): Promise<IOdspResponse<T>> {
        return fetchHelper(
            url,
            {
                body: postBody,
                headers,
                method: "POST",
            },
        );
    }
}
