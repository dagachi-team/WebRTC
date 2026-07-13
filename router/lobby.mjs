import express from "express"
import { isAuth } from "../middleware/auth.mjs"
import path from "path"
import { fileURLToPath } from "url"

const router = express.Router();
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 선생님 로비 연결
// http://127.0.0.1:8080/lobby/teacher (GET)
router.get("/teacher", (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "T_lobby.html"))
})


// 학생 로비 연결
// http://127.0.0.1:8080/lobby/student (GET)
router.get("/student", (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "S_lobby.html"))
})


export default router