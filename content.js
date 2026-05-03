// https://www.letskorail.com/ebizprd/EbizPrdTicketPr21111_i1.do

function injectJs(srcFile) {
    var scr = document.createElement('script');
    scr.src = srcFile;
    document.getElementsByTagName('head')[0].appendChild(scr);
}

function injectCode(fnc) {
	var scr = document.createElement('script');
	scr.textContent = '(' + fnc.toString() + ')();';
	document.getElementsByTagName('head')[0].appendChild(scr);
}

function redirectPage(href) {
	if (href.indexOf("javascript:") == 0) {
		href = "window.showModalDialog=window.showModalDialog || function(url, arg, opt) {window.open(url, arg, opt);};window.confirm=function (str) {return true;};infochk=function(a,b){infochk2(a,b);};" + href.substring(11, href.length);
		location.href = "javascript:" + href;
	} else {
		location.href = href;
	}
}

function bypassCapcha() {
	const targetElement = document.getElementById("captImg");
	if (!targetElement) {
		setTimeout(bypassCapcha, 500);
		return;
	}

	function toDataURL(imgElement) {
		var canvas = document.createElement("canvas");
		var ctx = canvas.getContext("2d");

		canvas.width = imgElement.width;
		canvas.height = imgElement.height;
		ctx.drawImage(imgElement, 0, 0, imgElement.width, imgElement.height);

		return canvas.toDataURL();
	}
	const dataURL = toDataURL(targetElement);
	chrome.extension.sendMessage({ type: 'detectText', dataURL: dataURL }, function(data) {
		injectCode(() => {
			const originalAlert = window.alert;
			window.alert = (message) => {
				if (message === '입력값이 일치하지 않습니다.') {
					window.location.reload();
					return;
				}

				return originalAlert(message);
			};
		});

		document.querySelector("#chkCapAnswer").value = data;
		document.querySelector('.ui-dialog button').click();
	});
}

var dsturl1 = "https://www.korail.com/ticket/search/list";
if (document.URL.substring(0, dsturl1.length) == dsturl1) {

	var bootstrap = function() {
		var hasModal = $('.ReactModal__Content').length > 0;
		if (hasModal) {
			var message = document.querySelector('.ReactModal__Content').textContent;
			if (message.includes('매크로 등 이상접속 감지')) {
				window.location.reload();
				return;
			}
		}

		var hasLoaded = $('.tckWrap .tckList .tck_inner').length > 0;
		if (!hasLoaded) {
			setTimeout(bootstrap, 100);
			return;
		}

		bypassCapcha();
		injectJs(chrome.extension.getURL('inject.js'));

		var coachSelected = JSON.parse(localStorage.getItem('coachSelected'));
		if (coachSelected == null) coachSelected = [];

		// 테이블에 "매크로" 버튼을 삽입한다.
		if ($(".tckWrap").length != 0) {
			var rows = $('.tckWrap .tckList .tck_inner');
			for (i = 0; i < rows.length; i++) {
				var trainNum = rows[i].querySelector('.num').textContent.trim();
				var checkbox = $('<div class="fl-l search-option-bar__check-wrap"></div>').html('' +
					'<input type="checkbox" id="coachMacro[' + trainNum + ']" name="checkbox" class="coachMacro" value="' + trainNum + '">' +
					'<label for="coachMacro[' + trainNum + ']" class="search-option-bar__checkbox-rt">매크로</label>' +
					'');
				checkbox.children('input').prop('checked', coachSelected.indexOf(trainNum) > -1);
				$(rows[i]).prepend(checkbox);
			}
		}

		if (localStorage.getItem('macro') == "true") {
			if ($(".tckWrap").length != 0) {
				var rows = $('.tckWrap .tckList .tck_inner');

				var succeed = false;
				for (i = 0; i < rows.length; i++) {
					var trainNum = rows[i].querySelector('.num').textContent.trim();
					var coach = $(rows[i]).children('div')[2];

					if (coachSelected.indexOf(trainNum) > -1) {
						if (!coach.classList.contains('sold_out')) {
							coach.querySelector('a').click();
							var tryClickReservBtn = function () {
								var $btn = $('.ticket_reserv_wrap .reservbtn');
								if ($btn.length != 0) {
									$btn.click();
									return;
								}

								setTimeout(tryClickReservBtn, 100);
							};
							tryClickReservBtn();
							succeed = true;
							break;
						}
					}
				}

				if (succeed == true) {
					localStorage.removeItem('macro');
					localStorage.removeItem('coachSelected');
					chrome.extension.sendMessage({type: 'playSound'}, function(data) { });
				} else {
					// 모두 실패한 경우
					setTimeout(function() {
						window.location.reload();
					}, 500);
				}
			} else {
				// 결과폼이 없는 경우 (오류 화면 발생?)
				history.go(-1);
			}
		}
	}
	$(document).ready(function () {
		if (localStorage.getItem('macro') == "true") {
			$(".search-option-bar__wrap").append('<button type="button" onclick="macrostop();" style="font-size:15px; margin-left:5px;"><img src="' + chrome.extension.getURL('btn_stop.png') + '"></button>');
		} else {
			$(".search-option-bar__wrap").append('<button type="button" onclick="macro();" style="font-size:15px; margin-left:5px;"><img src="' + chrome.extension.getURL('btn_start.png') + '"></button>');
		}

		bootstrap();
	});

}
