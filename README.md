## EXIT 8 WEBXR

This project is a **WebXR recreation of Exit 8**, a short Japanese indie horror/walking-simulator game. The core idea is navigating a repeating, looping underground passageway. Each loop looks nearly identical, but there are subtle differences in objects, characters, or signs.

Your job as the player is to **spot the oddities**. If something feels "off," you turn back. If everything looks normal, you keep moving forward. Making the wrong choice (missing an anomaly or turning back incorrectly) resets your progress.

Downlaod current models file at :

https://drive.google.com/drive/u/0/folders/1q-eyPBlRYaJlzrsrfpn7U7o0BMuCi0Ua

Downlaod current sound files at :

https://drive.google.com/drive/folders/15AZmtXNT9z6PH-nI1gyZBijSBGaocLdd?usp=sharing

## PWA Support

This project includes a Progressive Web App (PWA) setup with a manifest and a service worker. Features:
- Installable on supported browsers (desktop and mobile).
- Offline caching for core assets like `index.html`, `main.js`, and images.

Testing locally:
1. Serve the folder from localhost (PWA requires localhost/HTTPS). For example with Python 3:
```powershell
python -m http.server 8080
```
2. Open `http://localhost:8080` in Chrome or Edge.
3. Open DevTools > Application to check the manifest and service worker.
4. Use the Install button in the UI or the browser's install prompt to install the PWA.

Tips:
- Replace `images/fire.png` with higher-quality 192x192 and 512x512 icons for a better install experience.
- If you want to cache additional assets, extend the `PRECACHE_URLS` list in `sw.js`.
 - Models and sounds are intentionally not pre-cached by default because they can be very large and fill client storage.
	 - Models are lazy-loaded and the service worker uses a limited runtime cache (`MODELS_CACHE`) for models.
	 - Sounds are also runtime-cached with a size limit and the main theme will not be preloaded until user interaction.
 - Prefer hosting large assets (models, sounds) on CDNs or object storage (S3, GCS, Bucket) with caching headers and range support for better performance.

Prefetch and offline considerations
- If you want to pre-download large models and sounds for offline use, you can call the prefetch helper functions from the browser console:
	- `prefetchModel('models/fiendroom.glb')` — caches the model via the service worker's models cache.
	- `prefetchSound('fiend breath.mp3')` — caches an audio file via the sounds cache.
	- `prefetchBlueprintAssets({ forwardRoomType: 'fiendroom', backwardRoomType: 'corridor', hasAnomaly: true, anomalyType: 'DEMON' })` — convenience helper exposed to `window` for prefetching assets used by a blueprint.

Note: These prefetching operations will spend network bandwidth and storage—ask users for consent before doing a full download for offline.
