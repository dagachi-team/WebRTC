import MongoDB from "mongodb"
import { config } from "../config.mjs"

let db

// webrtcdb 접근
export async function connectDB() {
    return MongoDB.MongoClient.connect(config.db.host).then((client) => {
        db = client.db("webrtcdb")
    })
}

// webrtcusers 컬렉션 객체 접근
export function getUsers() {
    return db.collection("webrtcusers")
}

export function getRooms(){
    return db.collection("webrtcrooms")
}
