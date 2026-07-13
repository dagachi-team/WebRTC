import express from "express"
import * as roomRepository from "../repository/room.mjs"
import * as authRepository from "../repository/auth.mjs"

// 방 생성
export async function createRoom(req,res){
    const {title, subject, level } = req.body
    const user = await authRepository.findById(req.user)
    const nickname = user.nickname
    const room = await roomRepository.create(title,nickname,subject,level)
    res.status(201).json(room)
}

// 전체 방 가져오기
export async function getRooms(req,res){
    const rooms = await roomRepository.getAll()
    res.status(200).json(rooms)
}

export async function getRoom(req,res){
    const { roomId } = req.query
    const room = await roomRepository.getTitle(roomId)
    res.status(200).json(room.title)
}

// 임시 과외방 나가기 시 방 삭제 ======================
export async function deleteRoom(req, res) {
    try {
        const { roomId } = req.body
        
        if (!roomId) {
            return res.status(400).json({ message: "요청된 방의 ID가 누락되었습니다." })
        }

        await roomRepository.changeUse(roomId)

        res.status(200).json({ message: "방이 대기열에서 삭제 되었습니다." })
    } catch (error) {
        console.error("방 종료 컨트롤러 에러:", error)
        res.status(500).json({ message: "서버 내부 에러로 방을 종료하지 못했습니다." })
    }
}

// 과목별 방 가져오기
export async function getRoomsbySubject(req,res){
    const {subject} = req.query
    const rooms = await roomRepository.getBySubject(subject)
    res.status(200).json(rooms)
}

// 레벨별 방 가져오기
export async function getRoomsbyLevel(req,res){
    const {level} = req.query
    const rooms = await roomRepository.getByLevel(level)
    res.status(200).json(rooms)
}