window.onload = function() {
    // 폼의 기본 제출(페이지 이동) 막음
    document.getElementById("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault()
        await sendit()
    })
}

async function sendit() {
    const userid = document.getElementById("userid")
    const userpw = document.getElementById("userpw")

    // console.log(userid, userpw)

    // 아이디를 입력하지 않은 경우
    if(userid.value === "") {
        alert("아이디를 입력하세요")
        userid.focus()
        return false
    }

    // 비밀번호를 입력하지 않은 경우
    if(userpw.value === "") {
        alert("비밀번호를 입력하세요")
        userpw.focus()
        return false
    }

    // 서버로 로그인 요청 전송
    try{
        const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userid: userid.value,
                userpw: userpw.value
            })
        })

        const data = await res.json()
        
        if (!res.ok) {
            alert(data.message || "아이디 또는 비밀번호가 일치하지 않습니다")
            return false
        }
        
        // 로그인 성공 후 토큰 저장, 각 userType에 맞게 페이지 이동
        localStorage.setItem("token", data.token)
        localStorage.setItem("_id", data.user._id)
        alert("로그인 성공")

        if (data.user.userType === "teacher") {
            window.location.href = "/lobby/teacher"
        } else if (data.user.userType === "student") {
            window.location.href = "/lobby/student"
        } else {
            alert("유효하지 않은 유저 타입입니다")
        }
        
    } catch (err) {
        console.log("로그인 서버 통신 오류")
        console.error(err)
        alert("서버와 통신 중 오류가 발생했습니다")
    }
}