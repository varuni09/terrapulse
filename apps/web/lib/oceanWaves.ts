import maplibregl from "maplibre-gl";

export class RealisticOceanLayer implements maplibregl.CustomLayerInterface {
  id = "realistic-ocean-waves";
  type: "custom" = "custom";
  renderingMode: "3d" = "3d";
  program: WebGLProgram | null = null;
  aPos: number = 0;
  uMatrix: WebGLUniformLocation | null = null;
  uTime: WebGLUniformLocation | null = null;
  uCameraPos: WebGLUniformLocation | null = null;
  buffer: WebGLBuffer | null = null;
  map: maplibregl.Map | null = null;
  startTime: number = performance.now();

  private vs = `
    precision highp float;
    attribute vec2 a_pos;
    uniform mat4 u_matrix;
    uniform float u_time;
    varying vec3 v_worldPos;
    varying vec3 v_normal;
    varying float v_waveHeight;

    // Gerstner Wave Function for Realistic Ocean Dynamics
    vec3 gerstnerWave(vec2 pos, vec2 dir, float steepness, float wavelength, float speed, inout vec3 tangent, inout vec3 binormal) {
      float k = 2.0 * 3.14159265 / wavelength;
      float c = sqrt(9.8 / k);
      vec2 d = normalize(dir);
      float f = k * (dot(d, pos) - speed * c * u_time);
      float a = steepness / k;

      tangent += vec3(
        -d.x * d.x * (steepness * sin(f)),
        d.x * (steepness * cos(f)),
        -d.x * d.y * (steepness * sin(f))
      );
      binormal += vec3(
        -d.x * d.y * (steepness * sin(f)),
        d.y * (steepness * cos(f)),
        -d.y * d.y * (steepness * sin(f))
      );

      return vec3(
        d.x * (a * cos(f)),
        a * sin(f),
        d.y * (a * cos(f))
      );
    }

    void main() {
      vec3 gridPos = vec3(a_pos, 0.0);
      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 waveOffset = vec3(0.0);

      // Multiscale Wave Component Summation
      waveOffset += gerstnerWave(a_pos, vec2(1.0, 0.3), 0.18, 120.0, 1.2, tangent, binormal);
      waveOffset += gerstnerWave(a_pos, vec2(0.7, 0.7), 0.12, 60.0, 1.5, tangent, binormal);
      waveOffset += gerstnerWave(a_pos, vec2(0.2, 0.9), 0.08, 30.0, 1.8, tangent, binormal);
      waveOffset += gerstnerWave(a_pos, vec2(-0.5, 0.8), 0.04, 15.0, 2.2, tangent, binormal);

      vec3 finalPos = gridPos + waveOffset;
      v_worldPos = finalPos;
      v_waveHeight = waveOffset.y;
      v_normal = normalize(cross(binormal, tangent));

      gl_Position = u_matrix * vec4(finalPos, 1.0);
    }
  `;

  private fs = `
    precision highp float;
    uniform float u_time;
    uniform vec3 u_cameraPos;
    varying vec3 v_worldPos;
    varying vec3 v_normal;
    varying float v_waveHeight;

    void main() {
      vec3 normal = normalize(v_normal);
      vec3 viewDir = normalize(u_cameraPos - v_worldPos);
      vec3 sunDir = normalize(vec3(0.6, 0.7, 0.4));

      // Optics: Deep Ocean to Shallow Tropical Gradient
      vec3 deepColor = vec3(0.01, 0.06, 0.18);
      vec3 shallowColor = vec3(0.04, 0.28, 0.42);
      vec3 foamColor = vec3(0.92, 0.96, 1.0);

      // Fresnel Reflection Calculation
      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
      fresnel = mix(0.04, 0.95, fresnel);

      // Sun Specular Highlight
      vec3 halfVector = normalize(sunDir + viewDir);
      float spec = pow(max(dot(normal, halfVector), 0.0), 256.0) * 2.5;

      // Crest Foam Dynamics
      float foam = smoothstep(2.2, 4.5, v_waveHeight);

      // Final Color Assembly
      vec3 waterColor = mix(deepColor, shallowColor, smoothstep(-2.0, 3.0, v_waveHeight));
      vec3 finalColor = mix(waterColor, vec3(0.1, 0.45, 0.65), fresnel * 0.6);
      finalColor += vec3(spec);
      finalColor = mix(finalColor, foamColor, foam * 0.75);

      gl_FragColor = vec4(finalColor, 0.82);
    }
  `;

  onAdd(map: maplibregl.Map, gl: WebGLRenderingContext) {
    this.map = map;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, this.vs);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, this.fs);
    gl.compileShader(fs);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    this.aPos = gl.getAttribLocation(this.program, "a_pos");
    this.uMatrix = gl.getUniformLocation(this.program, "u_matrix");
    this.uTime = gl.getUniformLocation(this.program, "u_time");
    this.uCameraPos = gl.getUniformLocation(this.program, "u_cameraPos");

    // Construct World Plane Grid
    const verts: number[] = [];
    const size = 20000000;
    const step = size / 200;
    for (let x = -size; x < size; x += step) {
      for (let y = -size; y < size; y += step) {
        verts.push(x, y, x + step, y, x, y + step);
        verts.push(x + step, y, x + step, y + step, x, y + step);
      }
    }

    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  }

  render(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: any) {
    if (!this.program || !this.map) return;
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0);

    const time = (performance.now() - this.startTime) / 1000.0;
    gl.uniformMatrix4fv(this.uMatrix, false, matrix);
    gl.uniform1f(this.uTime, time);

    // Safe retrieval of camera position using this.map
    const mapInstance = this.map as any;
    const cam = mapInstance?.getFreeCameraOptions?.() || mapInstance?.getFreeCameraOptions;
    
    if (cam && cam.position) {
      gl.uniform3f(this.uCameraPos, cam.position.x, cam.position.y, cam.position.z);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 200 * 200 * 6);

    this.map.triggerRepaint();
  }
}
