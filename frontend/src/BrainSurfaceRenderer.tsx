import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export type EncodedFloatArray = {
  dtype: 'float32'
  shape: number[]
  compression: 'zlib'
  data_b64: string
}

export type SurfaceMeshJson = {
  name: 'fsaverage5' | string
  format_version: number
  dtype_vertices: 'float32'
  dtype_faces: 'int32'
  vertex_count_per_hemi: number
  lh: { vertices_b64: string; faces_b64: string }
  rh: { vertices_b64: string; faces_b64: string }
}

function base64ToUint8(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  // Modern browsers: native DecompressionStream('deflate') works for zlib streams.
  // If unavailable, surface rendering will gracefully fail in the caller.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (globalThis as any).DecompressionStream as undefined | (new (format: string) => DecompressionStream)
  if (!DS) throw new Error('DecompressionStream not available in this browser.')
  const ds = new DS('deflate')
  const stream = new Response(bytes).body
  if (!stream) throw new Error('Failed to create decompression stream.')
  const decompressed = stream.pipeThrough(ds)
  const buf = await new Response(decompressed).arrayBuffer()
  return new Uint8Array(buf)
}

export async function decodeEncodedFloat32(encoded: EncodedFloatArray): Promise<Float32Array> {
  if (encoded.dtype !== 'float32') throw new Error(`Unsupported dtype: ${encoded.dtype}`)
  if (encoded.compression !== 'zlib') throw new Error(`Unsupported compression: ${encoded.compression}`)
  const comp = base64ToUint8(encoded.data_b64)
  const raw = await inflateZlib(comp)
  return new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4))
}

function decodeMeshFloat32(b64: string): Float32Array {
  const bytes = base64ToUint8(b64)
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
}

function decodeMeshInt32(b64: string): Int32Array {
  const bytes = base64ToUint8(b64)
  return new Int32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function colorForZ(z: number, out: THREE.Color) {
  // z in [-3, 3] -> teal/green heat (match existing viewer)
  const t = (clamp(z, -3, 3) + 3) / 6
  const hue = 160 - t * 55 // 160->105
  const sat = 0.75
  const light = (30 + t * 30) / 100
  out.setHSL(hue / 360, sat, light)
}

export default function BrainSurfaceRenderer({
  mesh,
  activations,
  timestep,
  style,
}: {
  mesh: SurfaceMeshJson
  activations: Float32Array
  timestep: number
  style?: React.CSSProperties
}) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    lh: { geometry: THREE.BufferGeometry; colors: Float32Array }
    rh: { geometry: THREE.BufferGeometry; colors: Float32Array }
    dispose: () => void
  } | null>(null)

  const hemiN = mesh.vertex_count_per_hemi

  const t = useMemo(() => {
    const T = Math.max(1, Math.floor(activations.length / (hemiN * 2)))
    return clamp(timestep, 0, T - 1)
  }, [activations.length, hemiN, timestep])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const w = Math.max(1, mount.clientWidth)
    const h = Math.max(1, mount.clientHeight)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(w, h)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x07100c, 0.03)

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 5000)
    camera.position.set(0, 0, 300)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 50
    controls.maxDistance = 2000
    controls.target.set(0, 0, 0)

    const keyLight = new THREE.DirectionalLight(0xb8f0ce, 1.0)
    keyLight.position.set(120, 120, 160)
    scene.add(keyLight)
    scene.add(new THREE.AmbientLight(0x9de6ba, 0.28))

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0.06,
      side: THREE.DoubleSide,
    })

    // fsaverage5 vertices are in RAS (X = L-R, Y = A-P, Z = inferior-superior).
    // Three.js convention is X right, Y up, Z out of screen, so we need a -90° X
    // rotation to map RAS Z (superior) to screen-up. We bake this into the
    // positions instead of using a parent group so vertex normals stay correct.
    function buildHemi(verticesB64: string, facesB64: string, xOffset: number) {
      const verts = decodeMeshFloat32(verticesB64)
      const faces = decodeMeshInt32(facesB64)
      const geometry = new THREE.BufferGeometry()
      const pos = new Float32Array(verts.length)
      for (let i = 0; i < verts.length; i += 3) {
        const x = verts[i]
        const y = verts[i + 1]
        const z = verts[i + 2]
        pos[i] = x + xOffset
        pos[i + 1] = z
        pos[i + 2] = -y
      }
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const idx = new Uint32Array(faces.length)
      for (let i = 0; i < faces.length; i++) idx[i] = faces[i] >>> 0
      geometry.setIndex(new THREE.BufferAttribute(idx, 1))
      geometry.computeVertexNormals()

      const colors = new Float32Array((pos.length / 3) * 3)
      // Initialize to a visible neutral so the mesh shows up before the first
      // activation update lands.
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = 0.55
        colors[i + 1] = 0.78
        colors[i + 2] = 0.62
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const meshObj = new THREE.Mesh(geometry, mat)
      scene.add(meshObj)
      return { geometry, colors }
    }

    const lh = buildHemi(mesh.lh.vertices_b64, mesh.lh.faces_b64, -8)
    const rh = buildHemi(mesh.rh.vertices_b64, mesh.rh.faces_b64, 8)

    // Auto-center camera on the combined bounding box and frame the mesh.
    const bbox = new THREE.Box3()
      .union(new THREE.Box3().setFromBufferAttribute(lh.geometry.getAttribute('position') as THREE.BufferAttribute))
      .union(new THREE.Box3().setFromBufferAttribute(rh.geometry.getAttribute('position') as THREE.BufferAttribute))
    const center = bbox.getCenter(new THREE.Vector3())
    const size = bbox.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fovRad = (camera.fov * Math.PI) / 180
    const fitDist = (maxDim * 0.5) / Math.tan(fovRad * 0.5)
    const distance = fitDist * 1.6
    controls.target.copy(center)
    camera.position.set(center.x, center.y, center.z + distance)
    controls.update()

    let raf = 0
    const onResize = () => {
      const mw = Math.max(1, mount.clientWidth)
      const mh = Math.max(1, mount.clientHeight)
      camera.aspect = mw / mh
      camera.updateProjectionMatrix()
      renderer.setSize(mw, mh)
    }
    window.addEventListener('resize', onResize)

    const tick = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)

    const dispose = () => {
      window.removeEventListener('resize', onResize)
      window.cancelAnimationFrame(raf)
      controls.dispose()
      lh.geometry.dispose()
      rh.geometry.dispose()
      mat.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }

    stateRef.current = { renderer, scene, camera, controls, lh, rh, dispose }
    return () => {
      stateRef.current?.dispose()
      stateRef.current = null
    }
  }, [mesh])

  useEffect(() => {
    const st = stateRef.current
    if (!st) return
    const totalVerts = hemiN * 2
    const base = t * totalVerts
    const tmp = new THREE.Color()

    // LH
    for (let i = 0; i < hemiN; i++) {
      const z = activations[base + i] ?? 0
      colorForZ(z, tmp)
      const o = i * 3
      st.lh.colors[o] = tmp.r
      st.lh.colors[o + 1] = tmp.g
      st.lh.colors[o + 2] = tmp.b
    }
    ;(st.lh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true

    // RH
    const rhBase = base + hemiN
    for (let i = 0; i < hemiN; i++) {
      const z = activations[rhBase + i] ?? 0
      colorForZ(z, tmp)
      const o = i * 3
      st.rh.colors[o] = tmp.r
      st.rh.colors[o + 1] = tmp.g
      st.rh.colors[o + 2] = tmp.b
    }
    ;(st.rh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true
  }, [activations, hemiN, t])

  return <div ref={mountRef} style={{ width: '100%', height: '100%', ...style }} />
}

