function playSound() {
	if (typeof(audio) != "undefined" && audio) {
		audio.pause();
		document.body.removeChild(audio);
		audio = null;
	}
	audio = document.createElement('audio');
	document.body.appendChild(audio);
	audio.autoplay = true;
	audio.src = chrome.extension.getURL('tada.mp3');
	audio.play();
}

function sendTelegramMessage() {
	var botToken = localStorage['botToken'];
	var chatId = localStorage['chatId'];
	var msg = encodeURI('Macro has been stopped. Please check your reservation status.');
	if (botToken != undefined && chatId != undefined) {
		var url = 'https://api.telegram.org/bot' + botToken + '/sendmessage?chat_id=' + chatId + '&text=' + msg;
		
		var xmlhttp = new XMLHttpRequest();
		xmlhttp.onreadystatechange=function() {
			if (xmlhttp.readyState==4 && xmlhttp.status==200) {
				var response = xmlhttp.responseText; //if you need to do something with the returned value
			}
		}
		xmlhttp.open('GET', url, true);
		xmlhttp.send();
	}
}

function detectText(dataURL, callback) {
	function dataURLtoBlob(dataURL) {
		const parts = dataURL.split(';base64,');
		const contentType = parts[0].split(':')[1];
		const raw = window.atob(parts[1]);
		const rawLength = raw.length;

		const uInt8Array = new Uint8Array(rawLength);
		for (let i = 0; i < rawLength; ++i) {
			uInt8Array[i] = raw.charCodeAt(i);
		}

		return new Blob([uInt8Array], { type: contentType });
	}

	const blob = dataURLtoBlob(dataURL);
	const formData = new FormData();
	formData.append('file', blob);
	fetch('http://localhost:3000/vision/text-detection', {
		method: 'POST',
		body: formData,
	}).then(response => {
		return response.json();
	}).then(data => {
		callback(data[0].description);
	});
}

chrome.extension.onMessage.addListener(function(message, sender, sendResponse) {
    if (message && message.type == 'playSound') {
		playSound();
		sendTelegramMessage();
        sendResponse(true);
    }
	if (message && message.type == 'detectText') {
		detectText(message.dataURL, sendResponse);
		return true;
	}
});