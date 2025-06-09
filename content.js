// スライダーが既に追加されているかチェックするフラグ
let sliderInitialized = false;

// スライダーを初期化してページに追加するメインの関数
function initializeSlider() {
  // ★変更点：コントロール全体を包む親要素を探す
  const playerControls = document.querySelector('.ytp-chrome-controls');
  
  // ページに動画プレイヤーが存在し、まだスライダーが追加されていない場合のみ実行
  if (playerControls && !document.getElementById('custom-speed-slider-container')) {
    
    // 現在の動画要素を取得
    const video = document.querySelector('video');
    if (!video) return;

    // 1. スライダーとラベルを格納するコンテナを作成
    const sliderContainer = document.createElement('div');
    sliderContainer.id = 'custom-speed-slider-container';
    
    // 2. 再生速度を表示するラベルを作成
    const speedLabel = document.createElement('span');
    speedLabel.id = 'custom-speed-label';
    speedLabel.textContent = video.playbackRate.toFixed(2) + 'x';

    // 3. スライダー本体を作成
    const speedSlider = document.createElement('input');
    speedSlider.id = 'custom-speed-slider';
    speedSlider.type = 'range';
    speedSlider.min = '0.1';
    speedSlider.max = '5.0';
    speedSlider.step = '0.05';
    speedSlider.value = video.playbackRate;

    // スライダーの値をCSS変数に反映させる関数
    const updateSliderStyle = (value) => {
      const min = parseFloat(speedSlider.min);
      const max = parseFloat(speedSlider.max);
      const percent = ((value - min) / (max - min)) * 100;
      speedSlider.style.setProperty('--value-percent', `${percent}%`);
    };
    
    // 初期表示時にもスタイルを適用
    updateSliderStyle(speedSlider.value);

    // 4. スライダーを動かしたときの処理
    speedSlider.addEventListener('input', () => {
      const newSpeed = speedSlider.value;
      if(video) {
        video.playbackRate = newSpeed;
      }
      speedLabel.textContent = parseFloat(newSpeed).toFixed(2) + 'x';
      updateSliderStyle(newSpeed); // スタイルを更新
    });
    
    // ダブルクリックで速度をリセット(1.0x)する機能
    speedSlider.addEventListener('dblclick', () => {
      const newSpeed = 1.0;
      speedSlider.value = newSpeed;
      if(video) {
        video.playbackRate = newSpeed;
      }
      speedLabel.textContent = '1.00x';
      updateSliderStyle(newSpeed); // スタイルを更新
    });

    // 5. 作成した要素をコンテナに追加
    sliderContainer.appendChild(speedSlider);
    sliderContainer.appendChild(speedLabel);

    // 6. ★変更点：コントロール全体の親要素(.ytp-chrome-controls)に、
    // 右コントロール群(.ytp-right-controls)の「前」にスライダーコンテナを挿入する
    const rightControls = document.querySelector('.ytp-right-controls');
    if (playerControls && rightControls) {
      playerControls.insertBefore(sliderContainer, rightControls);
    } else if (playerControls) {
      // フォールバックとして元の追加処理を残す
      playerControls.appendChild(sliderContainer);
    }

    sliderInitialized = true;
  }
}

// YouTubeはページ遷移してもURLが変わるだけなので、
// DOMの変更を監視して、新しい動画が読み込まれるたびにスライダーを再設定する
const observer = new MutationObserver((mutations) => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(initializeSlider, 500); 
  }
  // プレイヤーが後から読み込まれる場合にも対応
  if (!document.getElementById('custom-speed-slider-container')) {
    initializeSlider();
  }
});

let lastUrl = location.href;
observer.observe(document.body, { childList: true, subtree: true });

// 最初の読み込み時にも実行
setTimeout(initializeSlider, 1000);