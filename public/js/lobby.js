const roomGrid = document.getElementById("roomGrid")
const chatInput = document.getElementById("chatInput")
const chatBox = document.getElementById("chatBox")
const chatTarget = document.getElementById("chatTarget")
const chatTargetInput = document.getElementById("chatTargetInput")
const createRoomBtn = document.getElementById("createRoomBtn")
const createRoomModal = document.getElementById("createRoomModal")
const cancelCreateBtn = document.getElementById("cancelCreateBtn")
const confirmCreateBtn = document.getElementById("confirmCreateBtn")
const userCounts = document.getElementById("userCounts")
const userListDiv = document.getElementById("userList")
const channelSelect = document.getElementById("channelSelect")
const subjectFilter = document.getElementById("subjectFilter")
const levelFilter = document.getElementById("levelFilter")

const socket = io()
const _token = localStorage.getItem("token")

let currentChannel = "로비"
let userType = "null"
let allRooms = []

// 백엔드에서 내 정보 가져오기
async function fetchUserInfo() {
    try {
        const response = await fetch("/auth/me", {
            method: "GET",
            headers: { "Authorization": `Bearer ${_token}` }
        })
        if (!response.ok) throw new Error("인증 실패")
        const { token, user } = await response.json()
        userType = user.userType
        console.log("userType:",userType)
        return user.nickname
    } catch (error) {
        console.error("유저 정보를 가져오지 못했습니다:", error)
        localStorage.removeItem("token")
    }
}

fetchUserInfo()

// 방 목록 가져오기
function renderRooms(roomsToRender) {
    roomGrid.innerHTML = ""

    if (roomsToRender.length === 0) {
        roomGrid.innerHTML = `<p class="no-room">조건에 맞는 방이 없습니다.</p>`
        return;
    }

    roomsToRender.forEach(room => {
        if (room.use) {
            const roomCard = document.createElement("div")
            roomCard.className = "room-card"
            
            roomCard.dataset.roomId = room._id;

            console.log(room.isOccupied)
            const dotClass = (room.isOccupied === true) ? "red" : "green";
            roomCard.innerHTML = `
                <div class="room-header">
                    <h2 class="room-title">${room.title}</h2>
                    <div class="room-status">
                        <span class="status-dot ${dotClass}"></span>
                    </div>
                </div>
                <div class="host-name">${room.nickname || room.username} 선생님</div>
                <div class="room-tags">
                    <span class="tag subject-tag">${room.subject}</span>
                    <span class="tag level-tag">${room.level}</span>
                </div>
            `

            roomCard.addEventListener("click", () => {
                if (!_token) {
                    alert("로그인이 필요한 서비스입니다.")
                    return
                }

                if (userType === "student") {
                    const confirmEnter = confirm(`'${room.title}' 과외방에 참여하시겠습니까?`)
                    if (confirmEnter) {
                        window.location.href = `/room.html?roomId=${room._id}`
                    }
                }
                else{
                    alert("선생님은 목록에서 직접 학생 방에 입장할 수 없습니다.")
                    return
                }
            })

            roomGrid.appendChild(roomCard);
        }
    })
}



function filterRooms() {
    const selectedSubject = subjectFilter.value
    const selectedLevel = levelFilter.value

    const filtered = allRooms.filter(room => {
        const matchSubject = (selectedSubject === "all" || room.subject === selectedSubject)
        const matchLevel = (selectedLevel === "all" || room.level === selectedLevel)
        return matchSubject && matchLevel
    });

    renderRooms(filtered);
}

async function fetchRooms() {
    try {
        const selectedSubject = subjectFilter ? subjectFilter.value : "all"
        const selectedLevel = levelFilter ? levelFilter.value : "all"

        let url = "/room/rooms"
        
        if (selectedSubject !== "all") {
            url = `/room/bySubject?subject=${encodeURIComponent(selectedSubject)}`
        } else if (selectedLevel !== "all") {
            url = `/room/byLevel?level=${encodeURIComponent(selectedLevel)}`
        }

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${_token}`
            }
        })

        if (!response.ok) {
            throw new Error("방 정보를 불러오지 못했습니다")
        }

        allRooms = await response.json(); 
        renderRooms(allRooms)
    } catch (error) {
        console.error(error)
    }
}

subjectFilter.addEventListener("change", filterRooms)
levelFilter.addEventListener("change", filterRooms)

// (수정)방 생성 버튼 이벤트===========================================

if (createRoomBtn) {
    createRoomBtn.addEventListener("click", () => {
        if (!_token) {
            alert("로그인이 필요합니다!")
            return
        }
        createRoomModal.style.display = "flex"
    })

    cancelCreateBtn.addEventListener("click", () => {
        createRoomModal.style.display = "none";
        document.getElementById("roomTitleInput").value = ""
    })

    confirmCreateBtn.addEventListener("click", async () => {
        const title = document.getElementById("roomTitleInput").value.trim()
        const subject = document.getElementById("roomSubjectSelect").value
        const level = document.getElementById("roomLevelSelect").value
        const userId = localStorage.getItem("_id")

        if (!title) {
            alert("방 제목을 입력해 주세요!")
            return
        }

        try {
            const response = await fetch("/room/create", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${_token}` 
                },
                body: JSON.stringify({
                    title: title,
                    subject: subject,
                    level: level,
                    userId: userId
                })
            })

            const result = await response.json();

            if (response.ok) {
                alert("방이 성공적으로 생성되었습니다!")
                createRoomModal.style.display = "none"
                document.getElementById("roomTitleInput").value = ""
                window.location.href = `/room.html?roomId=${result._id}&isTeacher=true`
            } else {
                alert("방 생성 실패: " + (result.message || "알 수 없는 오류"))
            }
        } catch (error) {
            console.error("방 생성 중 오류:", error)
            alert("서버와 통신 중 문제가 발생했습니다.")
        }
    })
}

// 방 클릭 이벤트
roomGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".room-card")
    if (!card) return;

    const roomId = card.dataset.roomId
    console.log("선택된 방 ID:", roomId)

    // localStorage.setItem("channel", roomId);
    // location.href = "/room.html";
})

function sendMessage() {
    const text = chatInput.value.trim()
    const targetType = chatTarget.value
    const whisperTo = chatTargetInput.value.trim()

    if (text) {
        const payload = { text: text }

        // 귓속말인 경우 처리
        if (targetType === "whisper") {
            if (!whisperTo) {
                alert("귓속말 상대를 입력하세요.")
                chatTargetInput.focus()
                return
            }
            payload.to = whisperTo
        }

        socket.emit("chat", payload)

        chatInput.value = ""
        if(targetType==="whisper"){
            chatTargetInput.value=""
        }
    }
}

// 전송 버튼
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage()
})
document.getElementById("sendBtn").addEventListener("click", sendMessage)

// 남이 보낸 메시지 화면에 띄우기
socket.on("message", (msg) => {
    const messageDiv = document.createElement("div")
    if (msg.user === "system") {
        messageDiv.style.color = "gray"
        messageDiv.style.fontSize = "0.9em"
        messageDiv.textContent = `[안내] ${msg.text}`
    } else {
        messageDiv.style.color = "black"
        messageDiv.textContent = `${msg.user}: ${msg.text}`
    }
    chatBox.appendChild(messageDiv)
    chatBox.scrollTop = chatBox.scrollHeight
})

// select 변경 이벤트 (귓속말 선택 시 인풋창 토글)
chatTarget.addEventListener("change", () => {
    if (chatTarget.value === "whisper") {
        chatTargetInput.style.display = "block"
        chatTargetInput.focus();
    } else {
        chatTargetInput.style.display = "none"
        chatTargetInput.value = ""
    }
})

// 귓속말 화면에 띄우기
socket.on("whisper", (msg) => {
    const messageDiv = document.createElement("div")
    messageDiv.style.color = "blue"
    messageDiv.textContent = `[귓속말] ${msg.user}: ${msg.text}`
    chatBox.appendChild(messageDiv)
    chatBox.scrollTop = chatBox.scrollHeight
})

async function initLobby() {
    try {
        const response = await fetch("/auth/me", {
            method: "GET",
            headers: { "Authorization": `Bearer ${_token}` }
        })
        if (!response.ok) throw new Error("인증 실패")
        const { user } = await response.json()
        
        socket.emit("join", { 
            nickname: user.nickname, 
            channel: "로비", 
            userType: user.userType 
        });
    } catch (error) {
        console.error("유저 정보를 가져오지 못했습니다:", error)
    }
    fetchRooms()
}

channelSelect.addEventListener("change", () => {
    const newChannelText = channelSelect.options[channelSelect.selectedIndex].text
    const newChannelValue = channelSelect.value
    
    if (newChannelValue === currentChannel) return;

    socket.emit("switchChannel", { 
        prevChannel: currentChannel, 
        nextChannel: newChannelValue 
    })

    currentChannel = newChannelValue

    const noticeDiv = document.createElement("div")
    noticeDiv.style.color = "purple"
    noticeDiv.style.fontSize = "0.9em"
    noticeDiv.textContent = `[안내] '${newChannelText}' 채널로 이동했습니다.`
    
    chatBox.appendChild(noticeDiv)
    chatBox.scrollTop = chatBox.scrollHeight
});

socket.on("userCounts", ({ tCount, sCount }) => {
    if (userCounts) {
        userCounts.innerHTML = `
            <span>선생님: ${tCount}명</span> | 
            <span>학생: ${sCount}명</span>
        `
    }
})

socket.on("userCounts", ({ tCount, sCount }) => {
    if (userCounts) {
        userCounts.innerHTML = `
            <span class="count-badge teacher">선생님 ${tCount}명</span>
            <span class="count-badge student">학생 ${sCount}명</span>
        `;
    }
});

socket.on("userList", (users) => {
    if (userListDiv) {
        userListDiv.innerHTML = ""
        users.forEach(u => {
            const div = document.createElement("div")
            div.className = "user-item"
            const roleBadge = u.userType === "teacher" ? "[선생님]" : "[학생]"
            div.textContent = `${roleBadge} ${u.nickname}`
            userListDiv.appendChild(div)
        });
    }
})

socket.on("room-status-changed", ({ roomId, isOccupied }) => {

    const targetRoom = allRooms.find(r => String(r._id) === String(roomId) || String(r.id) === String(roomId))
    if (targetRoom) {
        targetRoom.isOccupied = isOccupied
        
        if (typeof filterRooms === "function") {
            filterRooms()
        } else {
            renderRooms(allRooms)
        }
    }
})

initLobby()
