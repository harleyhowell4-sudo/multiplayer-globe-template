import "./styles.css";

import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import createGlobe, { type Arc, type Marker } from "cobe";
import usePartySocket from "partysocket/react";

import type { OutgoingMessage } from "../shared";

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(Math.max(value, minimum), maximum);

const demoMarkers: Marker[] = [
	{ id: "san-francisco", location: [37.7749, -122.4194], size: 0.045, color: [0.4, 0.75, 1] },
	{ id: "new-york", location: [40.7128, -74.006], size: 0.035 },
	{ id: "london", location: [51.5072, -0.1276], size: 0.035 },
	{ id: "tokyo", location: [35.6762, 139.6503], size: 0.035 },
	{ id: "sydney", location: [-33.8688, 151.2093], size: 0.035 },
	{ id: "sao-paulo", location: [-23.5505, -46.6333], size: 0.035 },
];

const connectionArcs = (markers: Marker[]): Arc[] => {
	if (markers.length < 2) return [];
	const hub = markers[0];
	return markers.slice(1, 7).map((marker) => ({
		from: hub.location,
		to: marker.location,
		color: [0.35, 0.6, 1],
	}));
};

function App() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const positions = useRef(new Map<string, Marker>());
	const markersChanged = useRef(true);

	const socket = usePartySocket({
		room: "default",
		party: "globe",
		onMessage(event) {
			const message = JSON.parse(event.data as string) as OutgoingMessage;
			if (message.type === "add-marker") {
				positions.current.set(message.position.id, {
					id: message.position.id,
					location: [message.position.lat, message.position.lng],
					size: message.position.id === socket.id ? 0.075 : 0.04,
					color:
						message.position.id === socket.id ? [0.4, 0.75, 1] : [0.95, 0.35, 0.55],
				});
			} else {
				positions.current.delete(message.id);
			}

			markersChanged.current = true;
		},
	});

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const rotation = { phi: 0.4, theta: 0.15, velocity: 0.002 };
		let dragging = false;
		let lastPointer = { x: 0, y: 0 };
		let frame = 0;
		let globe: ReturnType<typeof createGlobe> | undefined;

		const resize = () => {
			const bounds = canvas.getBoundingClientRect();
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const width = Math.max(1, Math.round(bounds.width * dpr));
			const height = Math.max(1, Math.round(bounds.height * dpr));
			if (canvas.width === width && canvas.height === height) return;
			canvas.width = width;
			canvas.height = height;
			globe?.update({ width, height });
		};

		resize();
		globe = createGlobe(canvas, {
			width: canvas.width,
			height: canvas.height,
			devicePixelRatio: 1,
			phi: rotation.phi,
			theta: rotation.theta,
			dark: 1,
			diffuse: 1.2,
			mapSamples: 16_000,
			mapBrightness: 5,
			mapBaseBrightness: 0.08,
			baseColor: [0.06, 0.08, 0.14],
			markerColor: [0.95, 0.35, 0.55],
			glowColor: [0.35, 0.55, 1],
			markers: [],
			opacity: 0.95,
		});

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);

		const render = () => {
			if (!dragging) {
				rotation.phi += rotation.velocity;
				rotation.velocity += (0.002 - rotation.velocity) * 0.025;
			}

			const update: Parameters<NonNullable<typeof globe>["update"]>[0] = {
				phi: rotation.phi,
				theta: rotation.theta,
			};
			if (markersChanged.current) {
				const markers = positions.current.size ? [...positions.current.values()] : demoMarkers;
				update.markers = markers;
				update.arcs = connectionArcs(markers);
				markersChanged.current = false;
			}
			globe?.update(update);
			frame = requestAnimationFrame(render);
		};
		render();

		const pointerDown = (event: PointerEvent) => {
			dragging = true;
			lastPointer = { x: event.clientX, y: event.clientY };
			canvas.setPointerCapture(event.pointerId);
		};
		const pointerMove = (event: PointerEvent) => {
			if (!dragging) return;
			const deltaX = event.clientX - lastPointer.x;
			const deltaY = event.clientY - lastPointer.y;
			rotation.phi += deltaX * 0.012;
			rotation.theta = clamp(rotation.theta + deltaY * 0.008, -0.65, 0.65);
			rotation.velocity = deltaX * 0.001;
			lastPointer = { x: event.clientX, y: event.clientY };
		};
		const pointerUp = (event: PointerEvent) => {
			dragging = false;
			if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		};

		canvas.addEventListener("pointerdown", pointerDown);
		canvas.addEventListener("pointermove", pointerMove);
		canvas.addEventListener("pointerup", pointerUp);
		canvas.addEventListener("pointercancel", pointerUp);

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			canvas.removeEventListener("pointerdown", pointerDown);
			canvas.removeEventListener("pointermove", pointerMove);
			canvas.removeEventListener("pointerup", pointerUp);
			canvas.removeEventListener("pointercancel", pointerUp);
			globe?.destroy();
		};
	}, []);

	return (
		<main className="App">
			<canvas ref={canvasRef} aria-label="Interactive globe showing live visitor locations" />
		</main>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
