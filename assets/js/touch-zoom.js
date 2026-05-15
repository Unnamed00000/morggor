(function () {
  const canvas = document.getElementById("treeCanvas");
  const zoomInButton = document.getElementById("zoomInButton");
  const zoomOutButton = document.getElementById("zoomOutButton");

  if (!canvas || canvas.dataset.nativeTouchZoom === "1") return;

  canvas.style.touchAction = "none";

  let pinch = null;

  function getTouchPair(event) {
    const touches = Array.from(event.touches);
    if (touches.length < 2) return null;
    return [touches[0], touches[1]];
  }

  function getDistance(first, second) {
    return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
  }

  function getCenter(first, second) {
    return {
      clientX: (first.clientX + second.clientX) / 2,
      clientY: (first.clientY + second.clientY) / 2,
    };
  }

  function dispatchWheelZoom(anchor, direction) {
    const deltaY = direction > 0 ? -100 : 100;
    let event;

    try {
      event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: anchor.clientX,
        clientY: anchor.clientY,
        deltaY,
      });
    } catch (error) {
      event = document.createEvent("WheelEvent");
      event.initWheelEvent("wheel", true, true, window, 0, 0, 0, anchor.clientX, anchor.clientY, 0, 0, 0, 0, 0, null, 0, deltaY, 0, 0);
    }

    canvas.dispatchEvent(event);
  }

  function getVisibleTreeAnchor() {
    const canvasRect = canvas.getBoundingClientRect();
    const visibleCards = Array.from(canvas.querySelectorAll(".person-card"))
      .map((card) => card.getBoundingClientRect())
      .filter((rect) => (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right >= canvasRect.left &&
        rect.left <= canvasRect.right &&
        rect.bottom >= canvasRect.top &&
        rect.top <= canvasRect.bottom
      ));

    if (!visibleCards.length) {
      return {
        clientX: canvasRect.left + canvasRect.width / 2,
        clientY: canvasRect.top + canvasRect.height / 2,
      };
    }

    const minX = Math.min(...visibleCards.map((rect) => rect.left));
    const maxX = Math.max(...visibleCards.map((rect) => rect.right));
    const minY = Math.min(...visibleCards.map((rect) => rect.top));
    const maxY = Math.max(...visibleCards.map((rect) => rect.bottom));

    return {
      clientX: Math.min(Math.max((minX + maxX) / 2, canvasRect.left + 24), canvasRect.right - 24),
      clientY: Math.min(Math.max((minY + maxY) / 2, canvasRect.top + 24), canvasRect.bottom - 24),
    };
  }

  function handleTouchStart(event) {
    if (event.target.closest(".person-card")) return;
    const pair = getTouchPair(event);
    if (!pair) return;

    event.preventDefault();
    pinch = {
      distance: getDistance(pair[0], pair[1]),
    };
  }

  function handleTouchMove(event) {
    if (!pinch) return;
    const pair = getTouchPair(event);
    if (!pair) {
      pinch = null;
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const distance = getDistance(pair[0], pair[1]);
    if (!Number.isFinite(distance) || distance < 20 || pinch.distance < 20) return;

    const ratio = distance / pinch.distance;
    if (ratio > 1.025) {
      dispatchWheelZoom(getCenter(pair[0], pair[1]), 1);
      pinch.distance = distance;
    } else if (ratio < 0.975) {
      dispatchWheelZoom(getCenter(pair[0], pair[1]), -1);
      pinch.distance = distance;
    }
  }

  function endTouch() {
    pinch = null;
  }

  function overrideZoomButton(button, direction) {
    if (!button) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      dispatchWheelZoom(getVisibleTreeAnchor(), direction);
    }, true);
  }

  canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
  canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
  canvas.addEventListener("touchend", endTouch);
  canvas.addEventListener("touchcancel", endTouch);

  overrideZoomButton(zoomInButton, 1);
  overrideZoomButton(zoomOutButton, -1);
})();
