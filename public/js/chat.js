const socket = io()
const roomInput = document.getElementById("roomInput")
const leaveBtn = document.getElementById("leaveBtn")
const statusText = document.getElementById("status")
const localVideo = document.getElementById("localVideo")
const remoteVideo = document.getElementById("remoteVideo")
const micSelect = document.getElementById("micSelect")
const speakerSelect = document.getElementById("speakerSelect")
const remoteVolume = document.getElementById("remoteVolume")
const micVolume = document.getElementById("micVolume")
const muteBtn = document.getElementById("muteBtn")
const remoteMuteBtn = document.getElementById("remoteMuteBtn")
const remoteMuteIcon = document.getElementById("remoteMuteIcon")
const videoStage = document.getElementById("videoStage")
const remoteCard = document.getElementById("remoteCard")
const localCard = document.getElementById("localCard")
const muteIcon = document.getElementById("muteIcon")
const controlPanel = document.getElementById("controlPanel")
const controlToggleBtn = document.getElementById("controlToggleBtn")
const controlCloseBtn = document.getElementById("controlCloseBtn")
const controlToggleIcon = document.getElementById("controlToggleIcon")
const shareScreenBtn = document.getElementById("shareScreenBtn")
const cameraToggleBtn = document.getElementById("cameraToggleBtn")
const cameraToggleIcon = document.getElementById("cameraToggleIcon")
const switchCameraBtn = document.getElementById("switchCameraBtn")
const screenShareCard = document.getElementById("screenShareCard")
const screenShareWaiting = document.getElementById("screenShareWaiting")
const screenShareVideo = document.getElementById("screenShareVideo")
const watchScreenBtn = document.getElementById("watchScreenBtn")
const leaveScreenViewBtn = document.getElementById("leaveScreenViewBtn")

let cameraVideoTrack = null
let fallbackVideoTrack = null
let currentFacingMode = "user"
let isCameraOff = false
let screenVideoTrack = null
let selectedMicId = ""
let selectedSpeakerId = ""
let isMicMuted = false
let isRemoteMuted = false
let lastRemoteVolumeBeforeMute = Number(remoteVolume.value || 0.5)
let lastMicVolumeBeforeMute = Number(micVolume.value || 1)
let audioContext = null
let micGainNode = null
let roomId = ""
let localStream = null
let localScreenStream = null
let remoteScreenStream = null
let availableScreenStream = null
let screenPeerConnection = null
let pendingScreenCandidates = []
let isScreenSharing = false
let isWatchingScreen = false
let remoteStream = null
let peerConnection = null
let pendingCandidates = []
let isJoining = false
let isInRoom = false
const iceServers = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302",
        },
    ],
}

async function getLoginUser() {
    const token = localStorage.getItem("token")

    if (!token) {
        return null
    }

    try {
        const response = await fetch("/auth/me", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        })

        if (!response.ok) {
            return null
        }

        const data = await response.json()

        return data.user
    } catch (error) {
        console.error("사용자 정보 조회 실패:", error)
        return null
    }
}

// 유저 타입에 따라 이동할 로비 주소 결정
function getLobbyUrlByUserType(userType) {
    if (userType === "teacher") {
        return "/lobby/teacher"
    }

    if (userType === "student") {
        return "/lobby/student"
    }

    return "/auth/login"
}

// 서버에 방 나가기 요청하고 응답 기다리기
function emitLeaveRoomAndWait() {
    return new Promise((resolve) => {
        if (!socket.connected) {
            resolve()
            return
        }

        let isDone = false

        const timer = setTimeout(() => {
            if (isDone) {
                return
            }

            isDone = true
            resolve()
        }, 1000)

        socket.emit("leave-room", () => {
            if (isDone) {
                return
            }

            isDone = true
            clearTimeout(timer)
            resolve()
        })
    })
}


socket.on("connect", () => {
    console.log("소켓 연결됨:", socket.id)

    // 소켓 연결되면 URL의 roomId로 자동 입장
    autoJoinRoom()
})
// URL에서 roomId 가져오기
function getRoomIdFromUrl() {
    const params = new URLSearchParams(window.location.search)
    return params.get("roomId")?.trim() || ""
}

// roomId로 자동 입장하는 함수
async function joinRoomById(nextRoomId) {
    if (isJoining || isInRoom) {
        return
    }

    roomId = String(nextRoomId || "").trim()
    console.log("roomId", roomId);
    

    try {
        const response = await fetch(`/room/roomTitle?roomId=${roomId}`)

        if (!response.ok) {
            return null
        }
        const title = await response.json()
        roomInput.value = title
    } catch (error) {
        console.error("사용자 정보 조회 실패:", error)
        return null
    }

    if (!roomId) {
        alert("방 정보가 없습니다. 로비에서 다시 입장해주세요.")
        statusText.textContent = "방 정보 없음"
        leaveBtn.disabled = true
        return
    }

    isJoining = true
    leaveBtn.disabled = true

    statusText.textContent = "카메라 준비 중..."

    try {
        // 내 카메라/마이크 준비
        await prepareLocalStream()

        // WebRTC 연결 객체 생성
        createPeerConnection()

        statusText.textContent = "방 입장 중..."

        // 서버에 방 입장 요청
        socket.emit("join-room", roomId)
    } catch (error) {
        console.error("입장 오류:", error)

        alert(`입장 오류: ${error.name}\n${error.message}`)

        isJoining = false
        isInRoom = false
        roomId = ""

        leaveBtn.disabled = true

        closePeerConnection()
        clearRemoteStream()
        stopLocalStream()
    }
}

// 페이지 접속 시 자동 입장
function autoJoinRoom() {
    const urlRoomId = getRoomIdFromUrl()
    joinRoomById(urlRoomId)
}
// 카메라 옵션 함수
function getCameraConstraints(facingMode = currentFacingMode) {
    return {
        width: {
            ideal: 1280,
        },
        height: {
            ideal: 720,
        },
        facingMode: {
            ideal: facingMode,
        },
    }
}
// 가상 화면 장치 확인 함수
function isProbablyScreenDevice(track) {
    const label = (track?.label || "").toLowerCase()

    const screenWords = [
        "screen",
        "display",
        "capture",
        "virtual",
        "obs",
        "manycam",
        "xsplit",
        "화면",
        "스크린",
        "캡처",
        "가상",
    ]

    return screenWords.some((word) => label.includes(word))
}
// 내 카메라/마이크를 가져오는 함수
async function prepareLocalStream() {
    const tracks = []

    cameraVideoTrack = null
    fallbackVideoTrack = null

    // 1. 카메라만 따로 요청
    try {
        const cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: getCameraConstraints(
                    currentFacingMode
                ),
                audio: false,
            })

        const videoTrack =
            cameraStream.getVideoTracks()[0] || null

        console.log(
            "선택된 영상 장치:",
            videoTrack?.label
        )

        console.log(
            "영상 설정:",
            videoTrack?.getSettings()
        )

        // 화면 캡처 또는 가상 카메라처럼 보이면 사용하지 않음
        if (
            videoTrack &&
            !isProbablyScreenDevice(videoTrack)
        ) {
            cameraVideoTrack = videoTrack

            // 기존 카메라 온·오프 상태 반영
            cameraVideoTrack.enabled = !isCameraOff

            tracks.push(cameraVideoTrack)
        } else {
            console.warn(
                "화면 캡처 또는 가상 장치로 판단되어 카메라로 사용하지 않습니다."
            )

            cameraStream
                .getTracks()
                .forEach((track) => track.stop())
        }
    } catch (error) {
        console.warn(
            "카메라 사용 불가:",
            error.name,
            error.message
        )
    }

    // 2. 실제 카메라가 없으면 검은 대체 트랙 사용
    if (!cameraVideoTrack) {
        fallbackVideoTrack = createBlackVideoTrack()

        if (fallbackVideoTrack) {
            tracks.push(fallbackVideoTrack)
        }
    }

    // 3. 마이크는 카메라와 별도로 요청
    try {
        let micStream =
            await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: getAudioConstraints(),
            })

        micStream =
            await applyMicGainToStream(micStream)

        const audioTrack =
            micStream.getAudioTracks()[0] || null

        if (audioTrack) {
            tracks.push(audioTrack)
        }
    } catch (error) {
        console.warn(
            "마이크 사용 불가:",
            error.name,
            error.message
        )
    }

    // 카메라 또는 검은 화면 + 마이크로 스트림 구성
    localStream = new MediaStream(tracks)

    localVideo.srcObject = localStream
    localVideo.muted = true
    localVideo.playsInline = true

    try {
        await localVideo.play()
    } catch (error) {
        console.warn(
            "내 화면 재생 실패:",
            error.message
        )
    }

    await loadMediaDevices()

    updateCameraButtons()
}

// 카메라가 없을 때 사용할 검은 화면 video track 생성 함수
function createBlackVideoTrack() {
    // canvas 생성
    const canvas = document.createElement("canvas")

    // canvas 크기 설정
    canvas.width = 640
    canvas.height = 360

    // canvas에 그림을 그리기 위한 2D context 가져오기
    const ctx = canvas.getContext("2d")

    // 배경색을 검은색으로 설정
    ctx.fillStyle = "black"

    // canvas 전체를 검은색으로 채움
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 글자 색상을 흰색으로 설정
    ctx.fillStyle = "white"

    // 글자 크기와 폰트 설정
    ctx.font = "32px Arial"

    // canvas 가운데쯤에 No Camera 문구 표시
    ctx.fillText("No Camera", 230, 180)

    // canvas를 영상 스트림처럼 변환
    // 5는 초당 프레임 수
    const stream = canvas.captureStream(5)

    // 만들어진 영상 스트림에서 video track 하나를 꺼내서 반환
    return stream.getVideoTracks()[0]
}

// ========================================
// 카메라 버튼 상태 표시
// ========================================
function updateCameraButtons() {
    const hasCamera =
        cameraVideoTrack &&
        cameraVideoTrack.readyState === "live"

    cameraToggleBtn.disabled = !hasCamera
    switchCameraBtn.disabled = !hasCamera

    if (isCameraOff) {
        cameraToggleIcon.textContent = "🚫"
        cameraToggleBtn.title = "카메라 켜기"
        cameraToggleBtn.classList.add("is-off")
    } else {
        cameraToggleIcon.textContent = "📷"
        cameraToggleBtn.title = "카메라 끄기"
        cameraToggleBtn.classList.remove("is-off")
    }
}


// ========================================
// 특정 방향의 카메라 트랙 가져오기
// ========================================
async function requestCameraTrack(facingMode) {
    const commonConstraints = {
        width: {
            ideal: 1280,
        },
        height: {
            ideal: 720,
        },
    }

    let cameraStream

    try {
        /*
         * 먼저 exact로 정확한 전면/후면 카메라 요청
         */
        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    ...commonConstraints,
                    facingMode: {
                        exact: facingMode,
                    },
                },
                audio: false,
            })
    } catch (error) {
        /*
         * 권한 거부라면 다시 요청하지 않음
         */
        if (
            error.name === "NotAllowedError" ||
            error.name === "SecurityError"
        ) {
            throw error
        }

        /*
         * exact를 지원하지 않거나 해당 방향 카메라를
         * 정확히 찾지 못하면 ideal로 다시 요청
         */
        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    ...commonConstraints,
                    facingMode: {
                        ideal: facingMode,
                    },
                },
                audio: false,
            })
    }

    const track =
        cameraStream.getVideoTracks()[0]

    if (!track) {
        cameraStream
            .getTracks()
            .forEach((streamTrack) => {
                streamTrack.stop()
            })

        throw new Error(
            "사용 가능한 카메라 트랙이 없습니다."
        )
    }

    return track
}


// ========================================
// 새로운 카메라 트랙을 통화에 적용
// ========================================
async function attachCameraTrack(
    newCameraTrack,
    videoSender
) {
    if (!localStream) {
        newCameraTrack.stop()

        throw new Error(
            "로컬 미디어 스트림이 없습니다."
        )
    }

    /*
     * localStream에 남아 있는 기존 영상 트랙 제거
     * 카메라 또는 No Camera 트랙이 대상
     */
    localStream
        .getVideoTracks()
        .forEach((track) => {
            localStream.removeTrack(track)

            if (track !== newCameraTrack) {
                track.stop()
            }
        })

    // 현재 카메라 꺼짐 상태 유지
    newCameraTrack.enabled = !isCameraOff

    cameraVideoTrack = newCameraTrack
    fallbackVideoTrack = null

    localStream.addTrack(newCameraTrack)

    /*
     * 상대방에게 전송하는 영상 트랙도 새 카메라로 교체
     */
    if (videoSender) {
        await videoSender.replaceTrack(
            newCameraTrack
        )
    } else if (peerConnection) {
        peerConnection.addTrack(
            newCameraTrack,
            localStream
        )
    }

    // 내 미리보기 갱신
    localVideo.srcObject = localStream

    try {
        await localVideo.play()
    } catch (error) {
        console.warn(
            "카메라 미리보기 재생 실패:",
            error.message
        )
    }

    updateCameraButtons()
}


// ========================================
// 카메라를 못 열었을 때 No Camera 트랙 적용
// ========================================
async function attachFallbackVideoTrack(
    videoSender
) {
    if (!localStream) {
        return
    }

    localStream
        .getVideoTracks()
        .forEach((track) => {
            localStream.removeTrack(track)
            track.stop()
        })

    fallbackVideoTrack =
        createBlackVideoTrack()

    cameraVideoTrack = null

    if (!fallbackVideoTrack) {
        return
    }

    localStream.addTrack(
        fallbackVideoTrack
    )

    if (videoSender) {
        await videoSender.replaceTrack(
            fallbackVideoTrack
        )
    }

    localVideo.srcObject = localStream

    try {
        await localVideo.play()
    } catch (error) {
        console.warn(
            "대체 화면 재생 실패:",
            error.message
        )
    }

    updateCameraButtons()
}


// ========================================
// 카메라 켜기/끄기
// ========================================
function toggleCamera() {
    if (
        !cameraVideoTrack ||
        cameraVideoTrack.readyState !== "live"
    ) {
        alert("사용 가능한 카메라가 없습니다.")
        return
    }

    isCameraOff = !isCameraOff

    /*
     * false로 설정하면 연결은 유지하면서
     * 상대방에게는 검은 영상 프레임이 전송됨
     */
    cameraVideoTrack.enabled =
        !isCameraOff

    updateCameraButtons()
}


// ========================================
// 전면/후면 카메라 전환
// ========================================
async function switchCamera() {
    if (
        !localStream ||
        !cameraVideoTrack
    ) {
        alert("사용 가능한 카메라가 없습니다.")
        return
    }

    const previousFacingMode =
        currentFacingMode

    const nextFacingMode =
        currentFacingMode === "user"
            ? "environment"
            : "user"

    /*
     * 기존 영상 sender를 카메라 종료 전에 저장
     */
    const videoSender =
        peerConnection
            ?.getSenders()
            .find((sender) => {
                return (
                    sender.track &&
                    sender.track.kind === "video"
                )
            })

    const oldCameraTrack =
        cameraVideoTrack

    switchCameraBtn.disabled = true
    switchCameraBtn.textContent = "⏳"

    /*
     * 모바일에서 카메라 전환이 막히지 않도록
     * 기존 카메라를 먼저 정지
     */
    localStream.removeTrack(
        oldCameraTrack
    )

    oldCameraTrack.stop()
    cameraVideoTrack = null

    try {
        const newCameraTrack =
            await requestCameraTrack(
                nextFacingMode
            )

        currentFacingMode =
            nextFacingMode

        await attachCameraTrack(
            newCameraTrack,
            videoSender
        )

        console.log(
            "카메라 전환 완료:",
            currentFacingMode
        )
    } catch (error) {
        console.error(
            "카메라 전환 실패:",
            error
        )

        /*
         * 전환 실패 시 원래 카메라 복구 시도
         */
        try {
            const restoredTrack =
                await requestCameraTrack(
                    previousFacingMode
                )

            currentFacingMode =
                previousFacingMode

            await attachCameraTrack(
                restoredTrack,
                videoSender
            )
        } catch (restoreError) {
            console.error(
                "기존 카메라 복구 실패:",
                restoreError
            )

            await attachFallbackVideoTrack(
                videoSender
            )
        }

        alert(
            "전면/후면 카메라 전환에 실패했습니다."
        )
    } finally {
        switchCameraBtn.textContent = "🔄"

        updateCameraButtons()
    }
}


// 카메라 켜기/끄기 버튼
cameraToggleBtn.addEventListener(
    "click",
    (event) => {
        event.preventDefault()
        event.stopPropagation()

        toggleCamera()
    }
)


// 전면/후면 카메라 전환 버튼
switchCameraBtn.addEventListener(
    "click",
    async (event) => {
        event.preventDefault()
        event.stopPropagation()

        await switchCamera()
    }
)

// WebRTC 연결 객체를 만드는 함수
function createPeerConnection() {
    // RTCPeerConnection 객체 생성
    // 이 객체가 상대방과 영상/음성을 주고받는 핵심 역할
    peerConnection = new RTCPeerConnection(iceServers)

    // 상대방 영상/음성을 담을 빈 MediaStream 생성
    remoteStream = new MediaStream()

    // 상대방 video 태그에 remoteStream 연결
    remoteVideo.srcObject = remoteStream

    // 모바일 브라우저 대응
    remoteVideo.playsInline = true

    // 내 localStream 안의 track들을 WebRTC 연결에 추가
    // video track, audio track 등이 들어갈 수 있음
    localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream)
    })

    // 상대방의 track이 도착했을 때 실행됨
    peerConnection.ontrack = async (event) => {
        // event.track.kind는 "video" 또는 "audio"
        console.log("상대방 track 도착:", event.track.kind)

        // 이미 같은 track이 remoteStream에 들어가 있는지 확인
        const alreadyExists = remoteStream
            .getTracks()
            .some((track) => track.id === event.track.id)

        // 중복이 아니면 상대방 track을 remoteStream에 추가
        if (!alreadyExists) {
            remoteStream.addTrack(event.track)
        }

        try {
            // 상대방 video 태그 재생
            await remoteVideo.play()
        } catch (error) {
            console.warn("상대방 화면 재생 실패:", error.message)
        }
    }

    // 내 브라우저에서 ICE Candidate가 생성될 때 실행
    peerConnection.onicecandidate = (event) => {
        // candidate가 있을 때만 서버로 보냄
        if (event.candidate) {
            // 서버를 통해 상대방에게 ICE Candidate 전달
            socket.emit("ice-candidate", event.candidate)
        }
    }

    // WebRTC 연결 상태가 바뀔 때 실행
    peerConnection.onconnectionstatechange = () => {
        console.log("connectionState:", peerConnection.connectionState)

        // 화면에 연결 상태 표시
        statusText.textContent = `연결 상태: ${peerConnection.connectionState}`
    }

    // ICE 연결 상태가 바뀔 때 실행
    peerConnection.oniceconnectionstatechange = () => {
        console.log("iceConnectionState:", peerConnection.iceConnectionState)
    }
}

// 내가 첫 번째 입장자일 때 서버가 보내주는 이벤트
socket.on("room-created", () => {
    isJoining = false
    isInRoom = true

    // joinBtn.disabled = true
    leaveBtn.disabled = false

    statusText.textContent = "방 생성 완료. 상대방을 기다리는 중..."
})

// 내가 두 번째 입장자일 때 서버가 보내주는 이벤트
socket.on("room-joined", async () => {
    isJoining = false
    isInRoom = true

    // joinBtn.disabled = true
    leaveBtn.disabled = false

    statusText.textContent = "방 입장 완료. offer 생성 중..."

    if (!peerConnection && localStream) {
        createPeerConnection()
    }

    await createOffer()
})

// 첫 번째 입장자에게 상대방이 들어왔다는 것을 알려주는 이벤트
socket.on("peer-joined", () => {
    statusText.textContent = "상대방이 입장했습니다. 연결 대기 중..."

    if (!peerConnection && localStream) {
        createPeerConnection()
    }
})

// offer를 생성하는 함수
async function createOffer() {
    try {
        // WebRTC 연결 요청서 생성
        const offer = await peerConnection.createOffer()

        // 내가 만든 offer를 내 브라우저에 저장
        await peerConnection.setLocalDescription(offer)

        // 서버를 통해 상대방에게 offer 전달
        socket.emit("offer", peerConnection.localDescription)
    } catch (error) {
        console.error("offer 생성 오류:", error)
    }
}

// 상대방에게서 offer를 받았을 때 실행
socket.on("offer", async (offer) => {
    try {
        statusText.textContent = "offer 받음. answer 생성 중..."

        if (!peerConnection && localStream) {
            createPeerConnection()
        }
        // 상대방의 offer를 내 브라우저에 저장
        await peerConnection.setRemoteDescription(offer)

        // 혹시 미리 도착해서 대기 중인 ICE Candidate가 있으면 처리
        await addPendingCandidates()

        // offer에 대한 응답 answer 생성
        const answer = await peerConnection.createAnswer()

        // 내가 만든 answer를 내 브라우저에 저장
        await peerConnection.setLocalDescription(answer)

        // 서버를 통해 상대방에게 answer 전달
        socket.emit("answer", peerConnection.localDescription)
    } catch (error) {
        console.error("offer 처리 오류:", error)
    }
})

// 상대방에게서 answer를 받았을 때 실행
socket.on("answer", async (answer) => {
    try {
        statusText.textContent = "answer 받음. 연결 중..."

        // 상대방의 answer를 내 브라우저에 저장
        await peerConnection.setRemoteDescription(answer)

        // 혹시 대기 중인 ICE Candidate가 있으면 처리
        await addPendingCandidates()
    } catch (error) {
        console.error("answer 처리 오류:", error)
    }
})

// 상대방에게서 ICE Candidate를 받았을 때 실행
socket.on("ice-candidate", async (candidate) => {
    try {
        // peerConnection이 아직 없거나
        // remoteDescription이 아직 설정되지 않았다면
        // candidate를 바로 추가하지 않고 임시 저장
        if (!peerConnection || !peerConnection.remoteDescription) {
            pendingCandidates.push(candidate)
            return
        }

        // 상대방의 ICE Candidate를 WebRTC 연결에 추가
        await peerConnection.addIceCandidate(candidate)
    } catch (error) {
        console.error("ICE Candidate 오류:", error)
    }
})

// 임시 저장된 ICE Candidate들을 처리하는 함수
async function addPendingCandidates() {
    // pendingCandidates 배열에 값이 남아 있는 동안 반복
    while (pendingCandidates.length > 0) {
        // 배열의 맨 앞 candidate를 꺼냄
        const candidate = pendingCandidates.shift()

        // WebRTC 연결에 candidate 추가
        await peerConnection.addIceCandidate(candidate)
    }
}

// 방 입장 오류가 났을 때 서버가 보내주는 이벤트
socket.on("room-error", (message) => {
    console.warn("방 입장 오류:", message)

    statusText.textContent = message

    isJoining = false
    isInRoom = false
    roomId = ""

    closePeerConnection()
    clearRemoteStream()
    stopLocalStream()

    leaveBtn.disabled = true

    alert(message)
})

// WebRTC 연결만 닫는 함수
function closePeerConnection() {
    if (!peerConnection) {
        return
    }

    peerConnection.ontrack = null
    peerConnection.onicecandidate = null
    peerConnection.onconnectionstatechange = null
    peerConnection.oniceconnectionstatechange = null

    peerConnection.close()
    peerConnection = null

    pendingCandidates = []
}

// 상대방 화면 비우기
function clearRemoteStream() {
    if (remoteStream) {
        remoteStream.getTracks().forEach((track) => {
            track.stop()
        })
    }

    remoteStream = new MediaStream()
    remoteVideo.srcObject = remoteStream
}

// 내 카메라/마이크 끄기
// 내 카메라, 마이크, 화면 공유 모두 종료
function stopLocalStream() {
    // 1. 카메라와 마이크 스트림 종료
    if (localStream) {
        localStream.getTracks().forEach((track) => {
            track.stop()
        })
    }

    // 2. 내가 공유 중인 화면 스트림 종료
    if (localScreenStream) {
        localScreenStream.getTracks().forEach((track) => {
            if (track.readyState === "live") {
                track.stop()
            }
        })
    }

    // 3. 내 영상 태그 비우기
    localVideo.pause()
    localVideo.srcObject = null

    // 4. 오디오 처리 종료
    if (
        audioContext &&
        audioContext.state !== "closed"
    ) {
        audioContext.close()
    }

    audioContext = null
    micGainNode = null

    // 5. 일반 화상채팅 스트림 초기화
    localStream = null
    cameraVideoTrack = null
    fallbackVideoTrack = null

    // 6. 화면 공유 스트림과 상태 초기화
    localScreenStream = null
    remoteScreenStream = null
    availableScreenStream = null
    screenVideoTrack = null

    isScreenSharing = false
    isWatchingScreen = false

    // 7. 화면 공유 전용 WebRTC 연결 종료
    closeScreenPeerConnection()

    // 8. 화면 공유 시청 카드 숨기기
    hideScreenShare()

    // 9. 화면 공유 버튼 원상 복구
    shareScreenBtn.textContent = "화면 공유"
    shareScreenBtn.classList.remove("is-sharing")
    // 카메라 상태 초기화
    currentFacingMode = "user"
    isCameraOff = false

    updateCameraButtons()
}

// 내가 방에서 나가는 함수
async function leaveRoom() {
    if (!isInRoom || !roomId) {
        return
    }

    const user = await getLoginUser()
    const lobbyUrl = getLobbyUrlByUserType(user?.userType)

    const leavingRoomId = roomId
    console.log("leavingRoomId", leavingRoomId);


    if (user?.userType === "teacher") {
        try {
            await fetch("/room/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({
                    roomId: leavingRoomId,
                }),
            })
        } catch (error) {
            console.error("방 삭제 요청 실패:", error)
        }
    }

    // 화면 공유 중이면 먼저 화면 공유 종료
    if (isScreenSharing || screenVideoTrack) {
        await stopScreenShare()
    }

    // 서버에 방 나가기 알림 후 잠깐 기다림
    await emitLeaveRoomAndWait()

    // WebRTC 연결과 스트림 정리
    closePeerConnection()
    clearRemoteStream()
    stopLocalStream()

    roomId = ""
    isJoining = false
    isInRoom = false

    isMicMuted = false
    isRemoteMuted = false

    micVolume.value = lastMicVolumeBeforeMute || 1
    remoteVolume.value = lastRemoteVolumeBeforeMute || 0.5
    remoteVideo.volume = Number(remoteVolume.value)

    updateMuteButton()
    updateRemoteMuteButton()

    leaveBtn.disabled = true

    statusText.textContent = "방에서 나갔습니다."

    // 선생님/학생 타입에 따라 로비 이동
    window.location.href = lobbyUrl
}

// 방 나가기 버튼 클릭
leaveBtn.addEventListener("click", async () => {
    const ok = confirm("방에서 나가시겠습니까?")

    if (!ok) {
        return
    }

    await leaveRoom()
})

// 상대방이 나갔을 때 서버가 보내주는 이벤트
socket.on("peer-left", () => {
    statusText.textContent =
        "상대방이 나갔습니다. 새 상대방을 기다리는 중..."

    closePeerConnection()
    clearRemoteStream()

    closeScreenPeerConnection()
    hideScreenShare()
})


// 마이크 옵션 만드는 함수
function getAudioConstraints() {
    return {
        // 선택한 마이크가 있으면 해당 마이크 사용
        deviceId: selectedMicId ? { exact: selectedMicId } : undefined,

        // 에코 제거
        echoCancellation: { ideal: true },

        // 주변 소음 억제
        noiseSuppression: { ideal: true },

        // 자동 음량 조절
        autoGainControl: { ideal: true },

        // 음성 통화용 1채널 권장
        channelCount: { ideal: 1 },

        // WebRTC 음성 샘플레이트
        sampleRate: { ideal: 48000 },
    }
}

async function applyMicGainToStream(stream) {
    // stream 안에서 오디오 트랙만 꺼냄
    const audioTracks = stream.getAudioTracks()

    // 마이크가 없으면 원래 stream 그대로 반환
    if (audioTracks.length === 0) {
        return stream
    }

    // 기존 video track들은 그대로 유지
    const videoTracks = stream.getVideoTracks()

    // AudioContext 생성
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    audioContext = new AudioContextClass()

    // 브라우저 정책 때문에 멈춰 있으면 다시 실행
    if (audioContext.state === "suspended") {
        await audioContext.resume()
    }

    // 기존 마이크 오디오 트랙을 MediaStream으로 감쌈
    const audioStream = new MediaStream([audioTracks[0]])

    // 오디오 소스 생성
    const source = audioContext.createMediaStreamSource(audioStream)

    // 볼륨 조절 노드 생성
    micGainNode = audioContext.createGain()

    // 현재 range 값으로 마이크 음량 설정
    micGainNode.gain.value = Number(micVolume.value || 1)

    // 최종 출력용 destination 생성
    const destination = audioContext.createMediaStreamDestination()

    // 마이크 소리 → 볼륨 조절 → 출력 스트림
    source.connect(micGainNode)
    micGainNode.connect(destination)

    // 볼륨 조절이 적용된 새 오디오 트랙
    const controlledAudioTrack = destination.stream.getAudioTracks()[0]

    // video track + 조절된 audio track으로 새 stream 생성
    const newStream = new MediaStream([
        ...videoTracks,
        controlledAudioTrack,
    ])

    return newStream
}

// 마이크/스피커 목록 불러오기
async function loadMediaDevices() {
    try {
        // 브라우저에서 사용 가능한 장치 목록 가져오기
        const devices = await navigator.mediaDevices.enumerateDevices()

        // 마이크 목록
        const microphones = devices.filter((device) => device.kind === "audioinput")

        // 스피커 목록
        const speakers = devices.filter((device) => device.kind === "audiooutput")

        // 마이크 select 초기화
        micSelect.innerHTML = `<option value="">기본 마이크</option>`

        microphones.forEach((device, index) => {
            const option = document.createElement("option")
            option.value = device.deviceId
            option.textContent = device.label || `마이크 ${index + 1}`

            if (device.deviceId === selectedMicId) {
                option.selected = true
            }

            micSelect.appendChild(option)
        })

        // 스피커 선택 기능 지원 여부 확인
        if (!("setSinkId" in HTMLMediaElement.prototype)) {
            speakerSelect.innerHTML = `<option value="">스피커 선택 미지원</option>`
            speakerSelect.disabled = true
            return
        }

        // 스피커 select 초기화
        speakerSelect.innerHTML = `<option value="">기본 스피커</option>`

        speakers.forEach((device, index) => {
            const option = document.createElement("option")
            option.value = device.deviceId
            option.textContent = device.label || `스피커 ${index + 1}`

            if (device.deviceId === selectedSpeakerId) {
                option.selected = true
            }

            speakerSelect.appendChild(option)
        })
    } catch (error) {
        console.error("장치 목록 불러오기 실패:", error)
    }
}

function updateRemoteMuteButton() {
    if (isRemoteMuted) {
        remoteMuteIcon.textContent = "🔇"
        remoteMuteBtn.classList.add("is-off")
        remoteMuteBtn.title = "상대방 소리 켜기"
    } else {
        remoteMuteIcon.textContent = "🔊"
        remoteMuteBtn.classList.remove("is-off")
        remoteMuteBtn.title = "상대방 소리 끄기"
    }
}

// 상대방 소리 음소거 상태 변경
function setRemoteMuted(nextMuted) {
    isRemoteMuted = nextMuted

    if (isRemoteMuted) {
        const currentVolume = Number(remoteVolume.value)

        if (currentVolume > 0) {
            lastRemoteVolumeBeforeMute = currentVolume
        }

        remoteVolume.value = 0
        remoteVideo.volume = 0
    } else {
        const restoreVolume = lastRemoteVolumeBeforeMute || 0.5

        remoteVolume.value = restoreVolume
        remoteVideo.volume = restoreVolume
    }

    updateRemoteMuteButton()
}

// 상대방 소리 조절
remoteVolume.addEventListener("input", () => {
    const volume = Number(remoteVolume.value)

    if (!isRemoteMuted && volume > 0) {
        lastRemoteVolumeBeforeMute = volume
    }

    // 소리가 꺼진 상태에서 슬라이더를 올리면 자동으로 켜기
    if (isRemoteMuted && volume > 0) {
        isRemoteMuted = false
        updateRemoteMuteButton()
    }

    remoteVideo.volume = volume
})

// 상대방 소리 끄기/켜기
remoteMuteBtn.addEventListener("click", () => {
    setRemoteMuted(!isRemoteMuted)
})

// 내 마이크 음량 조절
// 마이크 gain 값 변경
function setMicGain(value) {
    const volume = Number(value)

    if (micGainNode) {
        micGainNode.gain.value = volume
    }
}

// 실제 WebRTC로 보내는 마이크 트랙 켜기/끄기
function setMicrophoneTrackEnabled(enabled) {
    // localStream 안의 오디오 트랙 제어
    if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
            track.enabled = enabled
        })
    }

    // peerConnection sender 안의 오디오 트랙도 한 번 더 제어
    // 이걸 같이 해주면 상대방에게 나가는 마이크가 더 확실히 꺼짐
    if (peerConnection) {
        peerConnection.getSenders().forEach((sender) => {
            if (sender.track && sender.track.kind === "audio") {
                sender.track.enabled = enabled
            }
        })
    }
}

// 마이크 버튼 상태를 화면에 반영
function updateMuteButton() {
    if (isMicMuted) {
        muteIcon.textContent = "🎙️"
        muteIcon.classList.add("is-muted")
        muteBtn.classList.add("is-off")
        muteBtn.title = "마이크 켜기"
    } else {
        muteIcon.textContent = "🎙️"
        muteIcon.classList.remove("is-muted")
        muteBtn.classList.remove("is-off")
        muteBtn.title = "마이크 끄기"
    }
}

// 마이크 음소거 상태 변경
function setMicMuted(nextMuted) {
    isMicMuted = nextMuted

    if (isMicMuted) {
        // 끄기 전 음량 저장
        const currentVolume = Number(micVolume.value)

        if (currentVolume > 0) {
            lastMicVolumeBeforeMute = currentVolume
        }

        // 슬라이더를 0으로 내림
        micVolume.value = 0

        // 실제 마이크 소리도 0으로 만듦
        setMicGain(0)

        // WebRTC 오디오 트랙 끄기
        setMicrophoneTrackEnabled(false)
    } else {
        // 저장해둔 음량으로 복구
        const restoreVolume = lastMicVolumeBeforeMute || 1

        micVolume.value = restoreVolume

        // 실제 마이크 소리 복구
        setMicGain(restoreVolume)

        // WebRTC 오디오 트랙 켜기
        setMicrophoneTrackEnabled(true)
    }

    updateMuteButton()
}

// 내 마이크 음량 조절
micVolume.addEventListener("input", () => {
    const volume = Number(micVolume.value)

    // 마이크가 켜져 있을 때만 마지막 음량 저장
    if (!isMicMuted && volume > 0) {
        lastMicVolumeBeforeMute = volume
    }

    // 마이크가 꺼진 상태에서 슬라이더를 올리면 자동으로 마이크 켜기
    if (isMicMuted && volume > 0) {
        isMicMuted = false
        setMicrophoneTrackEnabled(true)
        updateMuteButton()
    }

    setMicGain(volume)
})

// 마이크 끄기/켜기
muteBtn.addEventListener("click", () => {
    if (!localStream) {
        return
    }

    setMicMuted(!isMicMuted)
})

// 스피커 선택
speakerSelect.addEventListener("change", async () => {
    selectedSpeakerId = speakerSelect.value

    try {
        if ("setSinkId" in remoteVideo) {
            await remoteVideo.setSinkId(selectedSpeakerId)
            console.log("스피커 변경:", selectedSpeakerId)
        } else {
            alert("이 브라우저는 스피커 선택을 지원하지 않습니다.")
        }
    } catch (error) {
        console.error("스피커 변경 실패:", error)
        alert("스피커 변경에 실패했습니다.")
    }
})

// 마이크 선택
micSelect.addEventListener("change", async () => {
    selectedMicId = micSelect.value

    // 아직 입장 전이면 선택값만 저장
    if (!localStream) {
        return
    }

    await changeMicrophone()
})

// 마이크를 변경하는 함수
async function changeMicrophone() {
    try {
        // 새 마이크 스트림 가져오기
        let newStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: getAudioConstraints(),
        })

        // 새 마이크에도 볼륨 조절 적용
        newStream = await applyMicGainToStream(newStream)

        const newAudioTrack = newStream.getAudioTracks()[0]

        // 현재 음소거 상태 반영
        newAudioTrack.enabled = !isMicMuted

        // 기존 오디오 트랙 제거
        const oldAudioTrack = localStream.getAudioTracks()[0]

        if (oldAudioTrack) {
            localStream.removeTrack(oldAudioTrack)
            oldAudioTrack.stop()
        }

        // localStream에 새 오디오 트랙 추가
        localStream.addTrack(newAudioTrack)

        // WebRTC 연결 중이면 상대방에게 보내는 트랙도 교체
        if (peerConnection) {
            const sender = peerConnection
                .getSenders()
                .find((sender) => sender.track && sender.track.kind === "audio")

            if (sender) {
                await sender.replaceTrack(newAudioTrack)
            } else {
                peerConnection.addTrack(newAudioTrack, localStream)
            }
        }

        console.log("마이크 변경 완료")
    } catch (error) {
        console.error("마이크 변경 실패:", error)
        alert("마이크 변경에 실패했습니다.")
    }
}

// 현재 어떤 화면이 큰 화면인지 확인하는 함수
function isMainCard(card) {
    const isLocalMain = videoStage.classList.contains("local-main")

    if (isLocalMain) {
        return card === localCard
    }

    return card === remoteCard
}

// 전체화면으로 여는 함수
async function openFullscreen(element) {
    try {
        if (document.fullscreenElement) {
            return
        }

        if (element.requestFullscreen) {
            await element.requestFullscreen()
        }
    } catch (error) {
        console.error("전체화면 전환 실패:", error)
    }
}

// 내 화면 카드 클릭
localCard.addEventListener("click", async () => {
    // 내 화면이 이미 큰 화면이면 전체화면
    if (isMainCard(localCard)) {
        await openFullscreen(localCard)
        return
    }

    // 내 화면을 큰 화면으로 변경
    videoStage.classList.add("local-main")
})

// 상대방 화면 카드 클릭
remoteCard.addEventListener("click", async () => {
    // 상대방 화면이 이미 큰 화면이면 전체화면
    if (isMainCard(remoteCard)) {
        await openFullscreen(remoteCard)
        return
    }

    // 상대방 화면을 큰 화면으로 변경
    videoStage.classList.remove("local-main")
})

// 오디오 설정 패널 열고 닫기
function toggleControlPanel() {
    controlPanel.classList.toggle("is-open")

    const isOpen = controlPanel.classList.contains("is-open")
    controlToggleIcon.textContent = isOpen ? "×" : "🎚️"
    controlToggleBtn.title = isOpen ? "오디오 설정 닫기" : "오디오 설정"
}

// 오디오 설정 버튼 클릭
controlToggleBtn.addEventListener("click", (event) => {
    event.stopPropagation()
    toggleControlPanel()
})

// 닫기 버튼 클릭
controlCloseBtn.addEventListener("click", (event) => {
    event.stopPropagation()
    controlPanel.classList.remove("is-open")
    controlToggleIcon.textContent = "🎚️"
    controlToggleBtn.title = "오디오 설정"
})

// 패널 안을 눌렀을 때 큰 화면 클릭 이벤트로 넘어가지 않게 막기
controlPanel.addEventListener("click", (event) => {
    event.stopPropagation()
})




// 화면 공유가 있다는 카드 표시 함수
function showScreenShareAvailable(stream) {
    availableScreenStream = stream

    screenShareCard.hidden = false
    screenShareWaiting.hidden = false
    screenShareVideo.hidden = true
    leaveScreenViewBtn.hidden = true

    isWatchingScreen = false
}
// ========================================
// 화면 공유 전용 연결 종료
// ========================================
function closeScreenPeerConnection() {
    if (screenPeerConnection) {
        screenPeerConnection.onicecandidate = null
        screenPeerConnection.ontrack = null
        screenPeerConnection.onconnectionstatechange = null

        screenPeerConnection.close()
        screenPeerConnection = null
    }

    pendingScreenCandidates = []
}


// ========================================
// 화면 공유 카드 표시
// stream이 null이면 상대방 공유 알림만 표시
// ========================================
function showScreenShareAvailable(stream = null) {
    availableScreenStream = stream

    screenShareCard.hidden = false
    screenShareWaiting.hidden = false
    screenShareVideo.hidden = true
    leaveScreenViewBtn.hidden = true

    screenShareVideo.pause()
    screenShareVideo.srcObject = null

    watchScreenBtn.disabled = false
    watchScreenBtn.textContent = stream
        ? "화면 공유 시청하기"
        : "상대방 화면 공유 시청하기"

    isWatchingScreen = false
}


// ========================================
// 화면 공유 카드 완전히 숨기기
// ========================================
function hideScreenShare() {
    isWatchingScreen = false
    availableScreenStream = null
    remoteScreenStream = null

    screenShareVideo.pause()
    screenShareVideo.srcObject = null

    screenShareCard.hidden = true
    screenShareWaiting.hidden = false
    screenShareVideo.hidden = true
    leaveScreenViewBtn.hidden = true

    watchScreenBtn.disabled = false
    watchScreenBtn.textContent = "화면 공유 시청하기"
}

// 본인 공유 화면 전용 재생 함수
async function startWatchingMyScreen() {
    if (!localScreenStream) {
        console.warn("내 화면 공유 스트림이 없습니다.")
        return
    }

    const screenTrack =
        localScreenStream.getVideoTracks()[0]

    if (
        !screenTrack ||
        screenTrack.readyState !== "live"
    ) {
        console.warn("내 화면 공유 트랙이 종료되었습니다.")
        return
    }

    /*
     * 기존 스트림을 그대로 넣어도 되지만,
     * 미리보기 전용 MediaStream을 따로 만들어 사용
     */
    availableScreenStream =
        new MediaStream([screenTrack])

    screenShareCard.hidden = false
    screenShareCard.removeAttribute("hidden")

    screenShareWaiting.hidden = true
    screenShareWaiting.setAttribute("hidden", "")

    screenShareVideo.hidden = false
    screenShareVideo.removeAttribute("hidden")

    leaveScreenViewBtn.hidden = false
    leaveScreenViewBtn.removeAttribute("hidden")

    screenShareVideo.muted = true
    screenShareVideo.autoplay = true
    screenShareVideo.playsInline = true
    screenShareVideo.srcObject =
        availableScreenStream

    isWatchingScreen = true

    try {
        await screenShareVideo.play()
        console.log("내 화면 공유 재생 성공")
    } catch (error) {
        console.error(
            "내 화면 공유 재생 실패:",
            error.name,
            error.message
        )

        alert(
            `내 공유 화면 재생 실패\n` +
            `${error.name}: ${error.message}`
        )
    }
}

// ========================================
// 실제 공유 화면 재생
// ========================================
async function startWatchingAvailableScreen() {
    if (!availableScreenStream) {
        console.warn("재생할 화면 공유 스트림이 없습니다.")
        return
    }

    screenShareVideo.srcObject = availableScreenStream

    screenShareWaiting.hidden = true
    screenShareVideo.hidden = false
    leaveScreenViewBtn.hidden = false

    isWatchingScreen = true

    try {
        await screenShareVideo.play()
        console.log("화면 공유 영상 재생 성공")
    } catch (error) {
        console.error("화면 공유 영상 재생 실패:", error)
    }

    watchScreenBtn.disabled = false
    watchScreenBtn.textContent = "화면 공유 시청하기"
}


// ========================================
// 화면 공유 전용 RTCPeerConnection 생성
// ========================================
function createScreenPeerConnection() {
    closeScreenPeerConnection()

    screenPeerConnection =
        new RTCPeerConnection(iceServers)

    // 내 ICE Candidate를 상대방에게 전달
    screenPeerConnection.onicecandidate = (event) => {
        if (!event.candidate) {
            return
        }

        socket.emit(
            "screen-ice-candidate",
            event.candidate
        )
    }

    // 상대방 화면 공유 트랙 도착
    screenPeerConnection.ontrack = async (event) => {
        console.log(
            "화면 공유 트랙 도착:",
            event.track.kind
        )

        remoteScreenStream =
            event.streams[0] ||
            new MediaStream([event.track])

        availableScreenStream = remoteScreenStream

        showScreenShareAvailable(remoteScreenStream)

        // 사용자가 이미 시청하기를 눌러 연결한 것이므로 바로 재생
        await startWatchingAvailableScreen()
    }

    screenPeerConnection.onconnectionstatechange = () => {
        if (!screenPeerConnection) {
            return
        }

        console.log(
            "화면 공유 연결 상태:",
            screenPeerConnection.connectionState
        )
    }
}


// ========================================
// 대기 중인 화면 공유 ICE 추가
// ========================================
async function addPendingScreenCandidates() {
    if (
        !screenPeerConnection ||
        !screenPeerConnection.remoteDescription
    ) {
        return
    }

    while (pendingScreenCandidates.length > 0) {
        const candidate =
            pendingScreenCandidates.shift()

        await screenPeerConnection
            .addIceCandidate(candidate)
    }
}


// ========================================
// 상대방이 화면 공유를 시작했을 때
// ========================================
socket.on("screen-share-started", () => {
    console.log("상대방 화면 공유 시작 알림")

    showScreenShareAvailable(null)

    statusText.textContent =
        "상대방이 화면을 공유하고 있습니다."
})


// ========================================
// 시청하기 버튼
// ========================================
watchScreenBtn.addEventListener(
    "click",
    async (event) => {
        event.preventDefault()
        event.stopPropagation()

        console.log("화면 공유 시청 버튼 클릭")
        console.log(
            "내 공유 스트림:",
            localScreenStream
        )
        console.log(
            "상대방 공유 스트림:",
            remoteScreenStream
        )

        if (!isInRoom || !roomId) {
            alert("먼저 방에 입장하세요.")
            return
        }

        // 내가 화면을 공유하고 있는 경우
        if (
            isScreenSharing &&
            localScreenStream
        ) {
            await startWatchingMyScreen()
            return
        }

        // 상대방 화면을 이미 받은 경우
        if (remoteScreenStream) {
            availableScreenStream =
                remoteScreenStream

            await startWatchingAvailableScreen()
            return
        }

        // 상대방 공유 화면 연결 요청
        watchScreenBtn.disabled = true
        watchScreenBtn.textContent = "연결 중..."

        socket.emit("join-screen-share")
    }
)


// ========================================
// 시청 나가기
// 공유 자체를 종료하지 않고 영상만 닫음
// ========================================
leaveScreenViewBtn.addEventListener(
    "click",
    (event) => {
        event.preventDefault()
        event.stopPropagation()

        isWatchingScreen = false

        screenShareVideo.pause()
        screenShareVideo.srcObject = null

        screenShareVideo.hidden = true
        screenShareWaiting.hidden = false
        leaveScreenViewBtn.hidden = true

        watchScreenBtn.disabled = false

        if (
            isScreenSharing &&
            localScreenStream
        ) {
            availableScreenStream =
                localScreenStream

            watchScreenBtn.textContent =
                "내 화면 공유 시청하기"
        } else {
            availableScreenStream =
                remoteScreenStream

            watchScreenBtn.textContent =
                "상대방 화면 공유 시청하기"
        }
    }
)

// ========================================
// 공유자가 시청 요청을 받음
// ========================================
socket.on("screen-viewer-joined", async () => {
    console.log("상대방이 화면 공유 시청을 요청함")

    if (!localScreenStream) {
        console.warn("공유 중인 화면이 없습니다.")
        return
    }

    try {
        createScreenPeerConnection()

        localScreenStream
            .getTracks()
            .forEach((track) => {
                screenPeerConnection.addTrack(
                    track,
                    localScreenStream
                )
            })

        const offer =
            await screenPeerConnection.createOffer()

        await screenPeerConnection
            .setLocalDescription(offer)

        socket.emit(
            "screen-offer",
            screenPeerConnection.localDescription
        )

        console.log("화면 공유 offer 전송 완료")
    } catch (error) {
        console.error(
            "화면 공유 offer 생성 실패:",
            error
        )
    }
})


// ========================================
// 시청자가 화면 공유 offer를 받음
// ========================================
socket.on("screen-offer", async (offer) => {
    console.log("화면 공유 offer 받음")

    try {
        createScreenPeerConnection()

        await screenPeerConnection
            .setRemoteDescription(offer)

        await addPendingScreenCandidates()

        const answer =
            await screenPeerConnection.createAnswer()

        await screenPeerConnection
            .setLocalDescription(answer)

        socket.emit(
            "screen-answer",
            screenPeerConnection.localDescription
        )

        console.log("화면 공유 answer 전송 완료")
    } catch (error) {
        console.error(
            "화면 공유 offer 처리 실패:",
            error
        )
    }
})


// ========================================
// 공유자가 answer를 받음
// ========================================
socket.on("screen-answer", async (answer) => {
    console.log("화면 공유 answer 받음")

    if (!screenPeerConnection) {
        return
    }

    try {
        await screenPeerConnection
            .setRemoteDescription(answer)

        await addPendingScreenCandidates()
    } catch (error) {
        console.error(
            "화면 공유 answer 처리 실패:",
            error
        )
    }
})


// ========================================
// 화면 공유 ICE Candidate 받기
// ========================================
socket.on(
    "screen-ice-candidate",
    async (candidate) => {
        try {
            if (
                !screenPeerConnection ||
                !screenPeerConnection.remoteDescription
            ) {
                pendingScreenCandidates.push(candidate)
                return
            }

            await screenPeerConnection
                .addIceCandidate(candidate)
        } catch (error) {
            console.error(
                "화면 공유 ICE 처리 실패:",
                error
            )
        }
    }
)


// ========================================
// 내가 화면 공유 시작
// ========================================
async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
        alert(
            "현재 브라우저에서는 화면 공유를 지원하지 않습니다."
        )
        return
    }

    if (!isInRoom || !roomId) {
        alert("먼저 방에 입장하세요.")
        return
    }

    if (isScreenSharing) {
        return
    }

    try {
        localScreenStream =
            await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: {
                        ideal: 15,
                        max: 30,
                    },
                },
                audio: false,
            })

        screenVideoTrack =
            localScreenStream.getVideoTracks()[0]

        if (!screenVideoTrack) {
            throw new Error(
                "화면 공유 영상 트랙이 없습니다."
            )
        }

        isScreenSharing = true

        // 내 컴퓨터에도 시청하기 카드 표시
        showScreenShareAvailable(localScreenStream)

        watchScreenBtn.textContent =
            "내 화면 공유 시청하기"

        shareScreenBtn.textContent =
            "화면 공유 중지"

        shareScreenBtn.classList.add(
            "is-sharing"
        )

        statusText.textContent =
            "화면을 공유하고 있습니다."

        // 상대방에게 공유 시작 알림
        socket.emit("screen-share-started")

        // 브라우저의 공유 중지 버튼을 눌렀을 때
        screenVideoTrack.addEventListener(
            "ended",
            async () => {
                if (isScreenSharing) {
                    await stopScreenShare()
                }
            },
            { once: true }
        )
    } catch (error) {
        console.error(
            "화면 공유 시작 실패:",
            error
        )

        localScreenStream = null
        screenVideoTrack = null
        isScreenSharing = false

        if (
            error.name === "NotAllowedError" ||
            error.name === "AbortError"
        ) {
            statusText.textContent =
                "화면 공유가 취소되었습니다."
            return
        }

        alert(
            `화면 공유 실패: ${error.message}`
        )
    }
}


// ========================================
// 내가 화면 공유 종료
// ========================================
async function stopScreenShare() {
    if (!isScreenSharing && !localScreenStream) {
        return
    }

    const oldScreenStream = localScreenStream

    // stop()이 ended 이벤트를 다시 발생시키므로 먼저 상태 초기화
    isScreenSharing = false
    localScreenStream = null
    screenVideoTrack = null

    if (oldScreenStream) {
        oldScreenStream
            .getTracks()
            .forEach((track) => {
                if (track.readyState === "live") {
                    track.stop()
                }
            })
    }

    closeScreenPeerConnection()
    hideScreenShare()

    shareScreenBtn.textContent = "화면 공유"
    shareScreenBtn.classList.remove("is-sharing")

    statusText.textContent =
        "화면 공유를 종료했습니다."

    // 상대방에게 종료 알림
    socket.emit("screen-share-stopped")
}


// ========================================
// 상대방이 화면 공유를 종료함
// ========================================
socket.on("screen-share-stopped", () => {
    console.log("상대방 화면 공유 종료")

    closeScreenPeerConnection()
    hideScreenShare()

    statusText.textContent =
        "상대방이 화면 공유를 종료했습니다."
})


// 화면 공유 버튼은 이 이벤트 하나만 유지
shareScreenBtn.addEventListener("click", async () => {
    if (isScreenSharing) {
        await stopScreenShare()
    } else {
        await startScreenShare()
    }
})

updateMuteButton()
updateRemoteMuteButton()
updateCameraButtons()

remoteVideo.volume = Number(remoteVolume.value)