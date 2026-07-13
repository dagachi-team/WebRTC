import express from "express"
import { config } from "../config.mjs"
import * as authRepository from "../repository/auth.mjs"
import * as bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// 회원 중복 체크
export async function checkId(req, res) {
    const { userid } = req.query
    const found = await authRepository.findByUserid(userid)
    res.json({ exists: !!found })
}

// 회원가입
export async function signup(req, res) {
    const { userid, userpw, nickname, username, email, userType } = req.body
    // console.log("req.body: ", req.body)

    // 회원 중복 체크
    const found = await authRepository.findByUserid(userid)
    if(found) {
        return res.status(409).json({ message: `${userid}은(는) 이미 존재하는 아이디입니다.` })
    }
    const hashed = bcrypt.hashSync(userpw, config.bcrypt.saltRounds)

    // 회원가입
    const userInsertedId = await authRepository.createUser(
        { userid, userpw: hashed, nickname, username, email, userType }
    )
    const token = await createJwtToken(userInsertedId)
    // console.log("userInsertedId: ", userInsertedId)
    // console.log("token: ", token)
    console.log("회원가입 성공 및 토큰 발급 완료")
    res.status(201).json({ token, userInsertedId })
}

// 로그인
export async function login(req, res) {
    const { userid, userpw } = req.body
    const user = await authRepository.findByUserid(userid)
    if(!user) {
        console.log("아이디가 존재하지 않음")
        return res.status(401).json({ message: "아이디 또는 비밀번호를 확인해주세요" })
    }

    const isValidPw = await bcrypt.compare(userpw, user.userpw)
    if(!isValidPw) {
        console.log("비밀번호가 일치하지 않음")
        return res.status(401).json({ message: "아이디 또는 비밀번호를 확인해주세요" })
    }

    // 아이디와 비밀번호 모두 통과하면 토큰 발급
    const token = await createJwtToken(user._id.toString())
    const { userpw: _, ...safeUser } = user
    console.log("로그인 성공 및 토큰 발급 완료")
    return res.status(200).json({ token, user: safeUser })
}

// 로그인 유지 체크
export async function me(req, res) {
    const { userpw, ...safeUser } = req.user
    res.status(200).json({ token: req.token, user: safeUser })
}

// 토큰 생성 함수
async function createJwtToken(id) {
    return jwt.sign({ id }, config.jwt.secretKey, {
        expiresIn: config.jwt.expiresInSec
    })
}
