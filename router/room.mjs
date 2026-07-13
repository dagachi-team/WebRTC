import express from "express"
import * as roomController from "../controller/room.mjs"
import { isAuth } from "../middleware/auth.mjs"

const router = express.Router();

//방 생성
// http://127.0.0.1:8080/room/create (POST)
router.post("/create",isAuth,roomController.createRoom)

//방 가져오기
// http://127.0.0.1:8080/room/rooms (GET)
//router.get("/rooms",isAuth,roomController.getRooms)
router.get("/rooms",roomController.getRooms)

// http://127.0.0.1:8080/room/roomSelete (GET)
router.get("/roomTitle",roomController.getRoom)

//과목별 방 가져오기
// http://127.0.0.1:8080/room/bySubject (GET)
router.get("/bySubject",isAuth,roomController.getRoomsbySubject)

//레벨별 방 가져오기
// http://127.0.0.1:8080/room/byLevel (GET)
router.get("/byLevel",isAuth,roomController.getRoomsbyLevel)

// 임시 과외방 나가기 시 방 삭제=========================
// http://127.0.0.1:8080/room/delete (POST)
router.post("/delete", isAuth, roomController.deleteRoom)

export default router