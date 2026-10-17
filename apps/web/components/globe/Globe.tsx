"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useRouter } from "next/navigation";
import { CITIES, City } from "./cities";

// Matches three.js SphereGeometry + equirectangular texture (lon -180 at u=0).
function latLonToVec3(lat: number, lon: number, r = 1) {
  const phi = THREE.MathUtils.degToRad(lon + 180);
  const theta = THREE.MathUtils.degToRad(90 - lat);
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function Graticule() {
  const lines = useMemo(() => {
    const out: THREE.Vector3[][] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 5) pts.push(latLonToVec3(lat, lon, 1.004));
      out.push(pts);
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const pts: THREE.Vector3[] = [];
      for (let lat = -90; lat <= 90; lat += 5) pts.push(latLonToVec3(lat, lon, 1.004));
      out.push(pts);
    }
    return out;
  }, []);
  return (
    <>
      {lines.map((p, i) => (
        <Line key={i} points={p} color="#3ee6c1" lineWidth={0.6} transparent opacity={0.22} />
      ))}
    </>
  );
}

function Atmosphere() {
  return (
    <mesh scale={1.18}>
      <sphereGeometry args={[1, 64, 64]} />
      <shaderMaterial
        side={THREE.BackSide}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        vertexShader={`varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`}
        fragmentShader={`varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0.,0.,1.)), 3.0); gl_FragColor = vec4(0.24,0.9,0.76,1.0) * i; }`}
      />
    </mesh>
  );
}

function Marker({
  city, globeRef, onHover,
}: { city: City; globeRef: React.RefObject<THREE.Mesh | null>; onHover: (h: boolean) => void }) {
  const router = useRouter();
  const [hover, setHover] = useState(false);
  const ring = useRef<THREE.Mesh>(null);
  const pos = useMemo(() => latLonToVec3(city.lat, city.lon, 1.01), [city]);
  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pos.clone().normalize()),
    [pos],
  );
  const color = city.live ? "#3ee6c1" : "#ff7a45";

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const s = 1 + ((clock.elapsedTime * 0.8) % 1) * 2.2;
    ring.current.scale.setScalar(s);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - (s - 1) / 2.2);
  });

  const set = (h: boolean) => {
    setHover(h);
    onHover(h);
    document.body.style.cursor = h && city.live ? "pointer" : "";
  };

  return (
    <group position={pos} quaternion={quat}>
      <mesh
        onPointerOver={(e) => { e.stopPropagation(); set(true); }}
        onPointerOut={() => set(false)}
        onClick={() => city.live && router.push(`/explore?city=${city.code}`)}
      >
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.025, 0.03, 32]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {hover && (
        <Html distanceFactor={4} occlude={[globeRef as React.RefObject<THREE.Object3D>]} style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap border border-[var(--line)] bg-black/80 px-3 py-2 font-mono text-[11px] uppercase tracking-widest">
            <div style={{ color }}>{city.name}</div>
            <div className="opacity-60">{city.live ? "Deep dive available" : "Coming soon"}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function Earth({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const globe = useRef<THREE.Mesh>(null);
  const hovering = useRef(false);
  const [tex, setTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    new THREE.TextureLoader().load(
      "/textures/earth.jpg",
      (t) => { t.colorSpace = THREE.SRGBColorSpace; setTex(t); },
      undefined,
      () => setTex(null), // no texture file yet: fall back to a plain sphere
    );
  }, []);

  // Start with Chennai facing the camera.
  const startRotY = useMemo(() => {
    const v = latLonToVec3(13.0827, 80.2707);
    return -Math.atan2(v.x, v.z);
  }, []);

  useFrame((_, dt) => {
    if (group.current && !hovering.current && !reduced) group.current.rotation.y += dt * 0.05;
  });

  return (
    <group ref={group} rotation-y={startRotY}>
      <mesh ref={globe}>
        <sphereGeometry args={[1, 96, 96]} />
        <meshStandardMaterial map={tex ?? undefined} color={tex ? "#ffffff" : "#0b2a4a"} roughness={1} metalness={0} />
      </mesh>
      <Graticule />
      {CITIES.map((c) => (
        <Marker key={c.code} city={c} globeRef={globe} onHover={(h) => (hovering.current = h)} />
      ))}
    </group>
  );
}

export default function Globe() {
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <Canvas
      frameloop={visible ? "always" : "never"} // stop rendering when the tab is hidden
      dpr={[1, 2]}
      camera={{ position: [0, 0, 3.2], fov: 45 }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[4, 2, 5]} intensity={1.6} />
      <Earth reduced={reduced} />
      <Atmosphere />
      <OrbitControls enableZoom={false} enablePan={false} rotateSpeed={0.5} />
    </Canvas>
  );
}
