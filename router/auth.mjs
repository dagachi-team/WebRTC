import express from "express"
import * as authController from "../controller/auth.mjs"
import { isAuth } from "../middleware/auth.mjs"
import path from "path"
import { fileURLToPath } from "url"

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)


// 아이디 중복 체크
router.get("/checkid", authController.checkId)

// 회원가입
router.post("/signup", authController.signup)

// http://127.0.0.1:8080/auth/signup (GET)
router.get("/signup", (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "signup.html"))
})

// 로그인
router.post("/login", authController.login)

// http://127.0.0.1:8080/auth/login (GET)
router.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "../public", "login.html"))
})

// 로그인 유지 체크
router.get("/me", isAuth, authController.me)

// 로그인 유치 체크 테스트 (내 정보 조회)
// router.get("/me", isAuth, (req, res) => {
//     res.json({ user: req.user })
// })

export default router

