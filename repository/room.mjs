import MongoDB, { ObjectId, ReturnDocument } from "mongodb"
import { getRooms } from "../db/user_database.mjs"

// 방 생성
export async function create(title,nickname, subject, level) {
    return getRooms().insertOne({
        title,
        nickname,
        subject,
        level,
        use : true
    }).then((result)=>{
        return getRooms().findOne({_id:result.insertedId})
    })
}

// 모든 방 가져오기
export async function getAll() {
    return getRooms().find().sort().toArray()
}

export async function getTitle(roomId) {
    return await getRooms().findOne( {_id: new ObjectId(roomId)})
}


// 해당하는 과목 방 리스트 가져오기
export async function getBySubject(subject) {
    return getRooms().find({ subject }).sort().toArray()
}

// 해당하는 레벨 방 가져오기
export async function getByLevel(level) {
    return getRooms().find({ level }).sort().toArray()
}

// 방 use false로 바꾸기
export async function changeUse(roomId) {
    return getRooms().findOneAndUpdate(
        { _id: new ObjectId(roomId) },
        { $set: { use: false } }
    ).then((result) => result)
}

// objectId -> string
// function mapOptionalPost(room) {
//     return room ? { ...room, id: room._id.toString() } : room
// }