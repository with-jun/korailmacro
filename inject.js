window.showModalDialog = window.showModalDialog || function(url, arg, opt) {
	window.open(url, arg, opt);
};

function macro() {
	coachSelected = [].map.call(document.querySelectorAll('.coachMacro:checked'), function (select) {
		return select.value;
	});

	if (coachSelected.length == 0) {
		alert("매크로를 실행하기 위해서는 예매하기 위한 열차 1개 이상을 선택하십시오.");
	} else {
		alert("매크로를 시작합니다.\n트럼펫 소리가 나면 5분 안에 결재를 마쳐주셔야 합니다.");

		localStorage.setItem('macro', true);
		localStorage.setItem('coachSelected', JSON.stringify(coachSelected));

		window.location.reload();
	}
}

function macrostop() {
	alert("매크로를 중지합니다.\n조건을 변경하여 재조회하신 후 다시 시작하실 수 있습니다.");
	localStorage.removeItem('macro');
	localStorage.removeItem('coachSelected');

	window.location.reload();
}