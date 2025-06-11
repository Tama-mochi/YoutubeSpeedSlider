// スライダーが既に追加されているかチェックするフラグ
let sliderInitialized = false;

// ドラッグ状態を管理するグローバル変数
let isDraggingSlider = false;

// スライダーを初期化してページに追加するメインの関数
function initializeSlider() {
  const playerControls = document.querySelector('.ytp-chrome-controls');
  if (!playerControls) return;

  const video = document.querySelector('video');
  if (!video) return;

  // --- スライダーの作成（初回のみ） ---
  if (!document.getElementById('custom-speed-slider-container')) {
    const sliderContainer = document.createElement('div');
    sliderContainer.id = 'custom-speed-slider-container';

    const speedLabel = document.createElement('span');
    speedLabel.id = 'custom-speed-label';

    const speedSlider = document.createElement('input');
    speedSlider.id = 'custom-speed-slider';
    speedSlider.type = 'range';
    speedSlider.min = '0.1';
    speedSlider.max = '5.0';
    speedSlider.step = '0.05';

    const updateSliderStyle = (slider, value) => {
      const min = parseFloat(slider.min);
      const max = parseFloat(slider.max);
      const percent = ((value - min) / (max - min)) * 100;
      slider.style.setProperty('--value-percent', `${percent}%`);
    };

    // 再生速度を1.0倍にリセットする共通関数
    const resetSpeedToDefault = () => {
      isDraggingSlider = false; // フラグをリセット
      const currentVideo = document.querySelector('video');
      const newSpeed = 1.0;
      if (currentVideo) {
        currentVideo.playbackRate = newSpeed;
      }
      speedSlider.value = newSpeed;
      speedLabel.textContent = '1.00x';
      updateSliderStyle(speedSlider, newSpeed);
      chrome.storage.local.set({ youtubeSpeed: newSpeed });
    };

    // マウスを押した時にドラッグ開始フラグを立てる
    speedSlider.addEventListener('mousedown', () => {
      isDraggingSlider = true;
    });

    speedSlider.addEventListener('input', () => {
      const currentVideo = document.querySelector('video');
      const newSpeed = speedSlider.value;
      if (currentVideo) {
        currentVideo.playbackRate = newSpeed;
      }
      speedLabel.textContent = parseFloat(newSpeed).toFixed(2) + 'x';
      updateSliderStyle(speedSlider, newSpeed);
    });

    // マウスを離した時にだけ速度を保存する
    speedSlider.addEventListener('change', () => {
      isDraggingSlider = false; // ドラッグ終了フラグを立てる
      chrome.storage.local.set({ youtubeSpeed: parseFloat(speedSlider.value) });
    });

    // スライダーとラベルにダブルクリックイベントを設定
    speedSlider.addEventListener('dblclick', resetSpeedToDefault);
    speedLabel.addEventListener('dblclick', resetSpeedToDefault);

    sliderContainer.appendChild(speedSlider);
    sliderContainer.appendChild(speedLabel);

    const rightControls = document.querySelector('.ytp-right-controls');
    if (rightControls) {
      playerControls.insertBefore(sliderContainer, rightControls);
    } else {
      playerControls.appendChild(sliderContainer);
    }
  }

  // --- 保存された速度の適用（毎回実行） ---
  const speedSlider = document.getElementById('custom-speed-slider');
  const speedLabel = document.getElementById('custom-speed-label');
  
  if (video && speedSlider && speedLabel) {
    // ユーザーがスライダーをドラッグ中は、保存値で上書きしないようにする
    if (isDraggingSlider) {
      return;
    }

    chrome.storage.local.get(['youtubeSpeed'], (result) => {
      const savedSpeed = result.youtubeSpeed || 1.0;
      
      video.playbackRate = savedSpeed;
      speedSlider.value = savedSpeed;
      speedLabel.textContent = parseFloat(savedSpeed).toFixed(2) + 'x';

      // スタイルも更新
      const min = parseFloat(speedSlider.min);
      const max = parseFloat(speedSlider.max);
      const percent = ((savedSpeed - min) / (max - min)) * 100;
      speedSlider.style.setProperty('--value-percent', `${percent}%`);
    });
  }
}

// DOMの変更を監視して、新しい動画が読み込まれるたびにスライダーを再設定する
const observer = new MutationObserver(() => {
  // プレイヤーのコントロールが表示されたら初期化処理を試みる
  if (document.querySelector('.ytp-chrome-controls')) {
    initializeSlider();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});