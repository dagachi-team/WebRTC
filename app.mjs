import express from "express"
import { createServer } from "http"
import { Server } from "socket.io"
import path from "path"
import { fileURLToPath } from "url"
import { config } from "./config.mjs"
import { connectDB } from "./db/user_database.mjs"
import authRouter from "./router/auth.mjs"
import roomRouter from "./router/room.mjs"
import lobbyRouter from "./router/lobby.mjs"
import { updateRoomStatus } from "./repository/room.mjs"

const app = express()
const server = createServer(app)
const io = new Server(server)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))
app.use("/auth", authRouter)
app.use("/room", roomRouter)
app.use("/lobby", lobbyRouter)

app.use((req, res) => {
    res.sendStatus(404)
})

const users = {}

const screenSharers = new Map()

function updateUserList() {
    let tCount = 0;
    let sCount = 0;
    const userList = [];

    Object.values(users).forEach(u => {
        if (u.userType === "teacher") tCount++;
        else if (u.userType === "student") sCount++;
        userList.push({ nickname: u.nickname, userType: u.userType });
    });


    io.to("로비").emit("userCounts", { tCount, sCount });
    io.to("로비").emit("userList", userList);
}

io.on("connection", (socket) => {
    console.log("사용자가 연결되었음")

    socket.on("join", ({ nickname, channel, userType }) => {
        Object.keys(users).forEach((id) => {
            if (users[id].nickname === nickname) {
                delete users[id]
            }
        })
        socket.nickname = nickname
        socket.channel = channel
        users[socket.id] = { nickname, channel, userType }
        socket.join(channel)

        const msg = { user: "system", text: `${nickname}님이 입장했습니다` }
        io.to(channel).emit("message", msg)

        updateUserList()
    })

    socket.on("chat", ({ text, to }) => {
        const sender = users[socket.id]
        if (!sender) return
        const payload = { user: sender.nickname, text }
        if (to) {
            const receiverSocket = Object.entries(users).find(
                ([id, u]) => u.nickname === to)?.[0]
            if (receiverSocket) {
                io.to(receiverSocket).emit("whisper", payload)
                socket.emit("whisper", payload)
            }
        } else {
            io.to(sender.channel).emit("message", payload)
            console.log("sender.channel: ", sender.channel, "payload:", payload)
        }


    })

    socket.on("switchChannel", ({ prevChannel, nextChannel }) => {
        const user = users[socket.id]
        if (!user) return

        socket.leave(prevChannel)
        const leaveMsg = { user: "system", text: `${user.nickname}님이 채널을 나갔습니다.` }
        io.to(prevChannel).emit("message", leaveMsg);

        socket.join(nextChannel)
        user.channel = nextChannel
        socket.channel = nextChannel

        const joinMsg = { user: "system", text: `${user.nickname}님이 입장했습니다.` }
        io.to(nextChannel).emit("message", joinMsg)

        updateUserList()
    })

    // socket.on("disconnect", () => {
    //     const user = users[socket.id]
    //     if (user) {
    //         const msg = { user: "system", text: `${user.nickname}님이 퇴장했습니다` }
    //         io.to(user.channel).emit("message", msg)
    //         delete users[socket.id]
    //         updateUserList()
    //     }
    //     console.log("사용자가 퇴장함")
    // })

    // =========================================
    // 방 입장
    // =========================================
    socket.on("join-room", async(receivedRoomId) => {
        const roomId = String(receivedRoomId || "").trim()

        if (!roomId) {
            socket.emit(
                "room-error",
                "방 이름을 입력하세요."
            )
            return
        }

        const room =
            io.sockets.adapter.rooms.get(roomId)

        const userCount = room ? room.size : 0

        console.log(
            "방 입장 요청:",
            roomId,
            "현재 인원:",
            userCount
        )

        // 1:1 방이므로 최대 2명

        if (userCount >= 2) {

            socket.emit(

                "room-error",

                "방이 가득 찼습니다."

            )

            return

        }



        // 방 입장
        socket.join(roomId)

        // 현재 소켓의 방 저장
        socket.data.roomId = roomId

        /*
         * 이미 상대방이 화면 공유 중이라면
         * 늦게 입장한 사용자에게 카드 표시 알림
         */
        const currentScreenSharer =
            screenSharers.get(roomId)

        if (
            currentScreenSharer &&
            currentScreenSharer !== socket.id
        ) {
            socket.emit("screen-share-started")
        }

        if (userCount === 0) {
            socket.emit("room-created")

            console.log("방 생성:", roomId)
        } else {
            socket.emit("room-joined")

            socket
                .to(roomId)
                .emit("peer-joined")

            await updateRoomStatus(roomId, true)
            
            io.emit("room-status-changed", { roomId, isOccupied: true })

            console.log(
                "두 번째 사람 입장:",
                roomId
            )
        }
    })

    // =========================================
    // 일반 화상채팅 WebRTC 신호 전달
    // =========================================
    socket.on("offer", (offer) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        socket.to(roomId).emit("offer", offer)
    })

    socket.on("answer", (answer) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        socket.to(roomId).emit("answer", answer)
    })

    socket.on("ice-candidate", (candidate) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        socket
            .to(roomId)
            .emit("ice-candidate", candidate)
    })

    // =========================================
    // 화면 공유 시작
    // =========================================
    socket.on("screen-share-started", () => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        // 현재 사용자를 이 방의 화면 공유자로 저장
        screenSharers.set(roomId, socket.id)

        console.log(
            "화면 공유 시작:",
            roomId,
            socket.id
        )

        // 같은 방의 상대방에게 카드 표시 알림
        socket
            .to(roomId)
            .emit("screen-share-started")
    })

    // =========================================
    // 화면 공유 시청 요청
    // =========================================
    socket.on("join-screen-share", () => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        const sharerId =
            screenSharers.get(roomId)

        if (!sharerId) {
            console.warn(
                "현재 화면 공유자가 없음:",
                roomId
            )

            socket.emit(
                "screen-share-unavailable"
            )
            return
        }

        console.log(
            "화면 공유 시청 요청:",
            socket.id,
            "→",
            sharerId
        )

        // 화면 공유자에게만 시청 요청 전달
        io
            .to(sharerId)
            .emit("screen-viewer-joined")
    })

    // =========================================
    // 화면 공유용 WebRTC 신호 전달
    // =========================================
    socket.on("screen-offer", (offer) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        socket
            .to(roomId)
            .emit("screen-offer", offer)
    })

    socket.on("screen-answer", (answer) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        socket
            .to(roomId)
            .emit("screen-answer", answer)
    })

    socket.on(
        "screen-ice-candidate",
        (candidate) => {
            const roomId = socket.data.roomId

            if (!roomId) {
                return
            }

            socket
                .to(roomId)
                .emit(
                    "screen-ice-candidate",
                    candidate
                )
        }
    )

    // =========================================
    // 화면 공유 종료
    // =========================================
    socket.on("screen-share-stopped", () => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        /*
         * 화면 공유를 시작한 사용자 본인이
         * 종료했을 때만 공유 상태 삭제
         */
        if (
            screenSharers.get(roomId) ===
            socket.id
        ) {
            screenSharers.delete(roomId)

            socket
                .to(roomId)
                .emit("screen-share-stopped")
        }

        console.log(
            "화면 공유 종료:",
            roomId,
            socket.id
        )
    })

    // =========================================
    // 방 나가기
    // =========================================
    socket.on("leave-room", async(done) => {
        const roomId = socket.data.roomId

        if (!roomId) {
            return
        }

        // 나가는 사용자가 화면 공유자라면 공유 종료
        if (
            screenSharers.get(roomId) ===
            socket.id
        ) {
            screenSharers.delete(roomId)

            socket
                .to(roomId)
                .emit("screen-share-stopped")
        }

        // 상대방에게 퇴장 알림
        socket
            .to(roomId)
            .emit("peer-left")

        await updateRoomStatus(roomId, false)
        //방이 비거나 자리가 나서 다시 초록색(빈 방)으로 돌아왔음을 로비에 전파
        io.emit("room-status-changed", { roomId, isOccupied: false })
        
        // Socket.IO 방 나가기
        socket.leave(roomId)

        // 방 정보 삭제
        delete socket.data.roomId

        if (typeof done === "function") {
            done({ ok: true })
        }
    })

    // =========================================
    // 연결 해제
    // =========================================
    socket.on("disconnect", () => {
        const roomId = socket.data.roomId

        if (roomId) {
            // 연결이 끊긴 사용자가 공유자라면 정리
            if (
                screenSharers.get(roomId) ===
                socket.id
            ) {
                screenSharers.delete(roomId)

                socket
                    .to(roomId)
                    .emit(
                        "screen-share-stopped"
                    )
            }

            socket
                .to(roomId)
                .emit("peer-left")
        }
        
        io.emit("room-status-changed", { roomId, isOccupied: false })
        console.log("나감:", socket.id)
    })
})

connectDB().then(() => {
    server.listen(config.host.port, () => {
        console.log("WebRTC 과제 DB/웹 서버 실행 중 ...")
    })
}).catch((err) => {
    console.log("서버 연결 실패")
    console.error(err)
})