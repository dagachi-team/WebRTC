import MongoDB from "mongodb"
import { getUsers } from "../db/user_database.mjs"

// 회원 중복 체크 및 로그인
export async function findByUserid(userid) {
    return getUsers().find({ userid }).next().then(mapOptionalUser)
}

// 회원가입
export async function createUser(user) {
    return getUsers()
        .insertOne({ ...user, createdAt: new Date() })
        .then((result) => result.insertedId.toString())
}

// 로그인 유지
export async function findById(id) {
    return getUsers().find({ _id: new MongoDB.ObjectId(id) }).next().then(mapOptionalUser)
}

function mapOptionalUser(user) {
    return user ? { ...user, id: user._id.toString() } : user
}