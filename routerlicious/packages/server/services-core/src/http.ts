import * as http from "http";

export type RequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => void;

export interface IWebServerFactory {
    create(requestListener: RequestListener): IWebServer;
}

export interface IWebSocket {
    id: string;

    on(event: string, listener: (...args: any[]) => void);

    join(id: string): Promise<void>;

    emit(event: string, ...args);

    broadcastToRoom(roomId: string, event: string, ...args: any[]);

    emitToRoom(roomId: string, event: string, ...args: any[]);
}

export interface IWebServer {
    /**
     * Web socket interface
     */
    webSocketServer: IWebSocketServer;

    /**
     * HTTP server interface
     */
    httpServer: IHttpServer;

    /**
     * Closes the web server
     */
    close(): Promise<void>;
}

export interface IWebSocketServer {
    on(event: string, listener: (...args: any[]) => void);

    close(): Promise<void>;
}

export interface IHttpServer {
    listen(port: any): void;

    on(event: string, listener: (...args: any[]) => void);

    address(): { port: number; family: string; address: string; };
}
