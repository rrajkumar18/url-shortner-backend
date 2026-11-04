import { createHash, randomUUID } from "node:crypto";

export function hashRefreshToken(token:string):string {
    return createHash('sha256').update(token).digest('hex');
}

export function createSessionId():string {
    return randomUUID();
}