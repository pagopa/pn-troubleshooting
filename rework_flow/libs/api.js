async function restartAttempt(iun, attemptId, recIndex, reason, task) {
    let url = `${process.env.ALB_BASE_URL}/delivery-push-private/v1/notifications/${iun}/restart-attempt`;
    let headers = {
        'Content-Type': 'application/json'
    };
    let data = {
        "attemptId": attemptId,
        "recIndex": recIndex,
        "reason": reason,
        "task": task
    };

    let response = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

const ApiClient = {
    restartAttempt
}

exports.ApiClient = ApiClient;