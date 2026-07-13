import jwt from "jsonwebtoken"
import { config } from "../config.mjs"
import * as authRepository from "../repository/auth.mjs"

const AUTH_ERROR = { message: "인증오류" }

// 로그인 유지 체크
export const isAuth = async (req, res, next) => {
    const authHeader = req.get("Authorization")
    console.log(authHeader)

    if(!authHeader || !authHeader.startsWith("Bearer ")) {
        console.log("헤더오류")
        return res.status(401).json(AUTH_ERROR)
    }

    // 인증 토큰이 존재한다면
    const token = authHeader.split(" ")[1]
    jwt.verify(token, config.jwt.secretKey, async(error, decoded) => {
        if(error) {
            console.log("토큰오류")
            return res.status(401).json(AUTH_ERROR)
        }

        const user = await authRepository.findById(decoded.id)
        if(!user) {
            console.log("해당 아이디 없음")
            return res.status(401).json(AUTH_ERROR)
        }
        req.user = user
        req.token = token
        console.log("middleware : isAuth")
        next()
    })
}
