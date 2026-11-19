var CAM_HTML = "";
var CAM_VER = "v1.3";
/* calc.js: 외팔보 계산부 (화면과 무관). 단위 mm, N, MPa, kg, Hz, J */
var BeamCalc = (function () {
  'use strict';
  var G0 = 9.80665;
  var S6 = Math.sqrt(0.6);
  var GP = [[-S6, 5 / 9], [0, 8 / 9], [S6, 5 / 9]];

  function clampT(kind, hTip, b, t) {
    if (kind === 'rect') return t;
    var lim = kind === 'tube' ? 0.45 * hTip : 0.45 * Math.min(hTip, b);
    return Math.min(t, lim);
  }

  // 상반부 구간 [y0, y1, 폭]
  function segs(kind, h, b, t) {
    if (kind === 'rect') return [[0, h / 2, b]];
    if (kind === 'box') return [[0, h / 2 - t, 2 * t], [h / 2 - t, h / 2, b]];
    return [[0, h / 2 - t, t], [h / 2 - t, h / 2, b]]; // ibeam
  }

  function qStrip(S, y) {
    var s = 0;
    for (var k = 0; k < S.length; k++) {
      var lo = Math.max(y, S[k][0]);
      if (S[k][1] > lo) s += S[k][2] * (S[k][1] * S[k][1] - lo * lo) / 2;
    }
    return s;
  }

  // 단면 높이 y에서 Q/폭 (tau = V * (Q/b) / I)
  function shearQb(kind, h, b, t, y) {
    var ay = Math.abs(y);
    if (ay >= h / 2) return 0;
    if (kind === 'tube') {
      var R = h / 2, r = R - t;
      var o = R * R - ay * ay, q = Math.pow(o, 1.5), w = Math.sqrt(o);
      if (ay < r) { var i2 = r * r - ay * ay; q -= Math.pow(i2, 1.5); w -= Math.sqrt(i2); }
      return w > 1e-12 ? (2 / 3 * q) / (2 * w) : 0;
    }
    var S = segs(kind, h, b, t), wd = S[S.length - 1][2];
    for (var k = 0; k < S.length; k++) { if (ay < S[k][1]) { wd = S[k][2]; break; } }
    return qStrip(S, ay) / wd;
  }

  function sectionProps(kind, h, b, t, nu) {
    var A, I, Iw, kappa, qb, yj = 0, qj = 0;
    if (kind === 'tube') {
      var D = h, d = D - 2 * t, m = d / D, m2 = m * m;
      A = Math.PI * (D * D - d * d) / 4;
      I = Math.PI * (Math.pow(D, 4) - Math.pow(d, 4)) / 64;
      Iw = I;
      kappa = 6 * (1 + nu) * (1 + m2) * (1 + m2) / ((7 + 6 * nu) * (1 + m2) * (1 + m2) + (20 + 12 * nu) * m2);
      qb = (D * D * D - d * d * d) / 12 / (D - d);
      return { A: A, I: I, Iw: Iw, kappa: kappa, qb: qb, c: D / 2, yj: 0, qj: 0 };
    }
    var S = segs(kind, h, b, t), k;
    A = 0; I = 0;
    for (k = 0; k < S.length; k++) {
      A += 2 * (S[k][1] - S[k][0]) * S[k][2];
      I += 2 * S[k][2] * (Math.pow(S[k][1], 3) - Math.pow(S[k][0], 3)) / 3;
    }
    if (kind === 'rect') Iw = h * b * b * b / 12;
    else if (kind === 'box') Iw = (h * b * b * b - (h - 2 * t) * Math.pow(b - 2 * t, 3)) / 12;
    else Iw = (2 * t * b * b * b + (h - 2 * t) * t * t * t) / 12;
    var integ = 0;
    for (k = 0; k < S.length; k++) {
      var half = (S[k][1] - S[k][0]) / 2, mid = (S[k][1] + S[k][0]) / 2;
      for (var g = 0; g < 3; g++) {
        var Q = qStrip(S, mid + half * GP[g][0]);
        integ += GP[g][1] * half * Q * Q / S[k][2];
      }
    }
    kappa = I * I / (A * 2 * integ);
    qb = qStrip(S, 0) / S[0][2];
    if (kind !== 'rect') { yj = h / 2 - t; qj = qStrip(S, yj) / S[0][2]; }
    return { A: A, I: I, Iw: Iw, kappa: kappa, qb: qb, c: h / 2, yj: yj, qj: qj };
  }

  function matG(mat) { return mat.G ? mat.G : mat.E / (2 * (1 + mat.nu)); }

  function makeBeam(p, N) {
    var L = p.L, n, i, x, ia;
    var a = p.loadCase === 'point' ? p.a * L : -1;
    if (a <= 0 || a >= L - 1e-9) {
      n = N + 1; x = new Float64Array(n); ia = N;
      for (i = 0; i < n; i++) x[i] = L * i / N;
    } else {
      var n1 = Math.max(2, Math.round(N * a / L)), n2 = Math.max(2, N - n1);
      n = n1 + n2 + 1; x = new Float64Array(n); ia = n1;
      for (i = 0; i <= n1; i++) x[i] = a * i / n1;
      for (i = 1; i <= n2; i++) x[n1 + i] = a + (L - a) * i / n2;
    }
    var tE = clampT(p.kind, p.h * p.taper, p.b, p.t);
    var B = {
      n: n, x: x, ia: ia, L: L, tE: tE, kind: p.kind, b: p.b,
      E: p.mat.E, G: matG(p.mat), nu: p.mat.nu, rho: p.mat.rho * 1e-9,
      h: new Float64Array(n), A: new Float64Array(n), I: new Float64Array(n), Iw: new Float64Array(n),
      kap: new Float64Array(n), qb: new Float64Array(n), c: new Float64Array(n),
      yj: new Float64Array(n), qj: new Float64Array(n),
      EI: new Float64Array(n), EIw: new Float64Array(n), kGA: new Float64Array(n)
    };
    var shear = p.shear !== false;
    for (i = 0; i < n; i++) {
      var hx = p.h * (1 - (1 - p.taper) * x[i] / L);
      var s = sectionProps(p.kind, hx, p.b, tE, B.nu);
      B.h[i] = hx; B.A[i] = s.A; B.I[i] = s.I; B.Iw[i] = s.Iw; B.kap[i] = s.kappa;
      B.qb[i] = s.qb; B.c[i] = s.c; B.yj[i] = s.yj; B.qj[i] = s.qj;
      B.EI[i] = B.E * s.I; B.EIw[i] = B.E * s.Iw;
      B.kGA[i] = shear ? s.kappa * B.G * s.A : 1e30;
    }
    return B;
  }

  function loadArrays(B, p) {
    var n = B.n, q = new Float64Array(n), P = new Float64Array(n), i, L = B.L;
    if (p.loadCase === 'point') P[B.ia] = p.W;
    else if (p.loadCase === 'udl') { for (i = 0; i < n; i++) q[i] = p.W / L; }
    else {
      var q0 = 2 * p.W / L;
      for (i = 0; i < n; i++) q[i] = p.triDir === 'tip' ? q0 * B.x[i] / L : q0 * (1 - B.x[i] / L);
    }
    return { q: q, P: P };
  }

  // 곡률 → 기울기, 처짐 (고정단에서 적분)
  function integrateCurv(B, cur) {
    var n = B.n, x = B.x, th = new Float64Array(n), v = new Float64Array(n);
    for (var i = 0; i < n - 1; i++) {
      var dx = x[i + 1] - x[i];
      th[i + 1] = th[i] + (cur[i] + cur[i + 1]) / 2 * dx;
      v[i + 1] = v[i] + (th[i] + th[i + 1]) / 2 * dx - dx * dx * (cur[i + 1] - cur[i]) / 12;
    }
    return { th: th, v: v };
  }

  // q: 절점 분포하중 N/mm (아래 +), P: 절점 집중하중 N
  function solve(B, q, P, EI) {
    var n = B.n, x = B.x, i, dx;
    EI = EI || B.EI;
    var Vr = new Float64Array(n), Vl = new Float64Array(n), M = new Float64Array(n);
    Vl[n - 1] = P ? P[n - 1] : 0;
    for (i = n - 2; i >= 0; i--) {
      dx = x[i + 1] - x[i];
      Vr[i] = Vl[i + 1] + (q[i] + q[i + 1]) / 2 * dx;
      Vl[i] = Vr[i] + (P ? P[i] : 0);
      M[i] = M[i + 1] + (Vr[i] + Vl[i + 1]) / 2 * dx + dx * dx * (q[i + 1] - q[i]) / 12;
    }
    var cur = new Float64Array(n);
    for (i = 0; i < n; i++) cur[i] = M[i] / EI[i];
    var r = integrateCurv(B, cur), ws = new Float64Array(n);
    for (i = 0; i < n - 1; i++) {
      dx = x[i + 1] - x[i];
      ws[i + 1] = ws[i] + (Vr[i] / B.kGA[i] + Vl[i + 1] / B.kGA[i + 1]) / 2 * dx;
    }
    return { Vl: Vl, Vr: Vr, M: M, th: r.th, wb: r.v, ws: ws };
  }

  // 외팔 기둥 Euler 좌굴 (역반복)
  function pcr(B, EI, iters) {
    var n = B.n, x = B.x, u = new Float64Array(n), cur = new Float64Array(n), i, P = 0, Pp = -1;
    for (i = 0; i < n; i++) u[i] = (x[i] / B.L) * (x[i] / B.L);
    iters = iters || 40;
    for (var it = 0; it < iters; it++) {
      for (i = 0; i < n; i++) cur[i] = (u[n - 1] - u[i]) / EI[i];
      var v = integrateCurv(B, cur).v;
      P = u[n - 1] / v[n - 1];
      for (i = 0; i < n; i++) u[i] = v[i] / v[n - 1];
      if (Math.abs(P - Pp) < 1e-12 * P) break;
      Pp = P;
    }
    return P;
  }

  function trapz(B, f) {
    var s = 0, x = B.x;
    for (var i = 0; i < B.n - 1; i++) s += (f(i) + f(i + 1)) / 2 * (x[i + 1] - x[i]);
    return s;
  }

  // 1차 고유진동수 (역반복). mq: kg/mm, mP: kg
  function freq(B, mq, mP, iters) {
    var n = B.n, u = new Float64Array(n), i, lam = 0;
    for (i = 0; i < n; i++) u[i] = 1;
    iters = iters || 4;
    var q = new Float64Array(n), P = new Float64Array(n), v = new Float64Array(n);
    for (var it = 0; it < iters; it++) {
      for (i = 0; i < n; i++) { q[i] = mq[i] * u[i]; P[i] = mP[i] * u[i]; }
      var s = solve(B, q, P), vmax = 0;
      for (i = 0; i < n; i++) { v[i] = s.wb[i] + s.ws[i]; if (Math.abs(v[i]) > vmax) vmax = Math.abs(v[i]); }
      var num = trapz(B, function (k) { return mq[k] * u[k] * v[k]; });
      var den = trapz(B, function (k) { return mq[k] * v[k] * v[k]; });
      for (i = 0; i < n; i++) { num += mP[i] * u[i] * v[i]; den += mP[i] * v[i] * v[i]; }
      lam = num / den;
      for (i = 0; i < n; i++) u[i] = v[i] / vmax;
    }
    return { f: Math.sqrt(lam * 1000) / (2 * Math.PI), shape: u };
  }

  // 축력 2차 효과: M = M0 + P(δ − w) 반복
  function secondOrder(B, w0, M0, Pax, Pcr) {
    var n = B.n, i;
    if (Pax >= 0.999 * Pcr) return { ok: false, it: 0 };
    var rho = Math.abs(Pax) / Pcr, om = Pax > 0 ? 1 : 1 / (1 + rho);
    var w = new Float64Array(w0), cur = new Float64Array(n), it, r = null, err = 1;
    for (it = 1; it <= 300; it++) {
      for (i = 0; i < n; i++) cur[i] = Pax * (w[n - 1] - w[i]) / B.EI[i];
      r = integrateCurv(B, cur);
      var tipOld = w[n - 1];
      for (i = 0; i < n; i++) w[i] = (1 - om) * w[i] + om * (w0[i] + r.v[i]);
      err = Math.abs(w[n - 1] - tipOld) / Math.max(Math.abs(w[n - 1]), 1e-30);
      if (err < 1e-9) break;
      if (!isFinite(w[n - 1]) || Math.abs(w[n - 1]) > 1e6 * Math.abs(w0[n - 1]) + 1e6) return { ok: false, it: it };
    }
    var M = new Float64Array(n), thAdd;
    for (i = 0; i < n; i++) { M[i] = M0[i] + Pax * (w[n - 1] - w[i]); cur[i] = Pax * (w[n - 1] - w[i]) / B.EI[i]; }
    thAdd = integrateCurv(B, cur).th;
    return { ok: err < 1e-6, it: it, w: w, M: M, thAdd: thAdd };
  }

  function dlf(zeta) {
    if (zeta <= 0) return 2;
    if (zeta >= 1) return 1;
    return 1 + Math.exp(-zeta * Math.PI / Math.sqrt(1 - zeta * zeta));
  }

  // 계단 하중 응답 배율 d(t), 정적 처짐 = 1
  function stepResp(t, f1, zeta) {
    var w = 2 * Math.PI * f1;
    if (zeta >= 1) { return 1 - Math.exp(-w * t) * (1 + w * t); }
    var wd = w * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + zeta / Math.sqrt(1 - zeta * zeta) * Math.sin(wd * t));
  }

  function analyze(p, opt) {
    opt = opt || {};
    var B = makeBeam(p, opt.N || 600), n = B.n, i;
    var ld = loadArrays(B, p), qs = new Float64Array(n);
    for (i = 0; i < n; i++) qs[i] = B.rho * G0 * B.A[i];
    var sA = solve(B, ld.q, ld.P), sS = solve(B, qs, null), us = p.selfW ? 1 : 0;
    var Vl = new Float64Array(n), Vr = new Float64Array(n), M1 = new Float64Array(n);
    var th = new Float64Array(n), w1 = new Float64Array(n);
    for (i = 0; i < n; i++) {
      Vl[i] = sA.Vl[i] + us * sS.Vl[i]; Vr[i] = sA.Vr[i] + us * sS.Vr[i];
      M1[i] = sA.M[i] + us * sS.M[i]; th[i] = sA.th[i] + us * sS.th[i];
      w1[i] = sA.wb[i] + sA.ws[i] + us * (sS.wb[i] + sS.ws[i]);
    }
    var e = n - 1;
    var tipBend = sA.wb[e] + us * sS.wb[e], tipShear = sA.ws[e] + us * sS.ws[e];
    var tipA = sA.wb[e] + sA.ws[e], tipS = sS.wb[e] + sS.ws[e];
    var Pax = p.Pax || 0;
    var PcrS = (opt.lite && Pax === 0) ? NaN : pcr(B, B.EI), PcrW = opt.lite ? NaN : pcr(B, B.EIw);
    var M = M1, w = w1, amp = 1, iters = 0, stable = true;
    if (Pax !== 0) {
      var so = secondOrder(B, w1, M1, Pax, PcrS);
      iters = so.it;
      if (so.ok) {
        M = so.M; w = so.w;
        for (i = 0; i < n; i++) th[i] += so.thAdd[i];
        amp = Math.abs(w1[e]) > 1e-30 ? w[e] / w1[e] : 1;
      } else { stable = false; }
    }
    var slope = new Float64Array(n);
    for (i = 0; i < n; i++) slope[i] = th[i] + Vl[i] / B.kGA[i];
    var sTop = new Float64Array(n), sBot = new Float64Array(n), tau = new Float64Array(n), vm = new Float64Array(n);
    var vmMax = 0, vmI = 0, sT = 0, sC = 0, sAbs = 0, sI = 0, tM = 0, tI = 0;
    for (i = 0; i < n; i++) {
      var sb = M[i] * B.c[i] / B.I[i], sax = -Pax / B.A[i];
      sTop[i] = sb + sax; sBot[i] = -sb + sax;
      tau[i] = Vl[i] * B.qb[i] / B.I[i];
      var v1 = Math.max(Math.abs(sTop[i]), Math.abs(sBot[i]));
      var v2 = Math.sqrt(sax * sax + 3 * tau[i] * tau[i]);
      var v3 = 0;
      if (B.yj[i] > 0) {
        var sj = Math.abs(sb) * B.yj[i] / B.c[i] + Math.abs(sax), tj = Vl[i] * B.qj[i] / B.I[i];
        v3 = Math.sqrt(sj * sj + 3 * tj * tj);
      }
      vm[i] = Math.max(v1, v2, v3);
      if (vm[i] > vmMax) { vmMax = vm[i]; vmI = i; }
      if (v1 > sAbs) { sAbs = v1; sI = i; }
      sT = Math.max(sT, sTop[i], sBot[i]); sC = Math.max(sC, -sTop[i], -sBot[i]);
      if (Math.abs(tau[i]) > tM) { tM = Math.abs(tau[i]); tI = i; }
    }
    var crit = p.mat.crit, SF, gov, peak, peakX;
    if (crit.type === 'vm') {
      SF = vmMax > 0 ? crit.sy / vmMax : Infinity; gov = 'yield'; peak = vmMax; peakX = B.x[vmI];
    } else {
      var c1 = sT > 0 ? crit.xt / sT : Infinity, c2 = sC > 0 ? crit.xc / sC : Infinity, c3 = tM > 0 ? crit.s / tM : Infinity;
      SF = Math.min(c1, c2, c3);
      gov = SF === c1 ? 'tension' : (SF === c2 ? 'compression' : 'shear');
      peak = sAbs; peakX = B.x[sI];
    }
    var U = trapz(B, function (k) { return M[k] * M[k] / (2 * B.EI[k]); });
    for (i = 0; i < n - 1; i++) U += (Vr[i] * Vr[i] / B.kGA[i] + Vl[i + 1] * Vl[i + 1] / B.kGA[i + 1]) / 4 * (B.x[i + 1] - B.x[i]);
    var mass = B.rho * trapz(B, function (k) { return B.A[k]; });
    var f1 = NaN, shape = null;
    if (!opt.lite) {
      var mq = new Float64Array(n), mP = new Float64Array(n);
      for (i = 0; i < n; i++) { mq[i] = B.rho * B.A[i] + (p.hang ? ld.q[i] / G0 : 0); mP[i] = p.hang ? ld.P[i] / G0 : 0; }
      var fr = freq(B, mq, mP); f1 = fr.f; shape = fr.shape;
    }
    var PcrMin = isNaN(PcrW) ? PcrS : Math.min(PcrS, PcrW);
    return {
      B: B, x: B.x, V: Vl, Vr: Vr, M: M, M1: M1, th: slope, w: w, w1: w1,
      sTop: sTop, sBot: sBot, tau: tau, vm: vm, q: ld.q, P: ld.P, qs: qs,
      tip: w[e], tip1: w1[e], tipA: tipA, tipS: tipS, tipBend: tipBend, tipShear: tipShear,
      shearFrac: Math.abs(w1[e]) > 1e-30 ? tipShear / w1[e] : 0,
      R: Vl[0], M0: M[0], peak: peak, peakX: peakX, vmMax: vmMax, vmX: B.x[vmI],
      sT: sT, sC: sC, tauMax: tM, tauX: B.x[tI], SF: SF, gov: gov, util: SF > 0 ? 1 / SF : Infinity,
      f1: f1, shape: shape, dlf: dlf(p.zeta || 0), mass: mass, U: U / 1000,
      PcrS: PcrS, PcrW: PcrW, PcrMin: PcrMin, amp: amp, iters: iters, stable: stable,
      k: (p.W > 0 && tipA > 0) ? p.W / tipA : NaN,
      dLim: p.L / (p.limitN || 180), tE: B.tE,
      Wtot: Vl[0]
    };
  }

  // 균일 단면·축력 0일 때 굽힘 처짐 닫힌 해
  function closedForm(p, B) {
    if (p.taper !== 1 || (p.Pax || 0) !== 0) return null;
    var L = p.L, EI = B.EI[0], a = p.a * L, d;
    if (p.loadCase === 'point') d = p.W * a * a * (3 * L - a) / (6 * EI);
    else if (p.loadCase === 'udl') d = p.W * L * L * L / (8 * EI);
    else if (p.triDir === 'tip') d = 11 * p.W * L * L * L / (60 * EI);
    else d = p.W * L * L * L / (15 * EI);
    var sw = p.selfW ? B.rho * G0 * B.A[0] * Math.pow(L, 4) / (8 * EI) : 0;
    return { load: d, self: sw, total: d + sw };
  }

  function interp(x, arr, xv) {
    var n = x.length;
    if (xv <= x[0]) return arr[0];
    if (xv >= x[n - 1]) return arr[n - 1];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (x[m] <= xv) lo = m; else hi = m; }
    var f = (xv - x[lo]) / (x[hi] - x[lo]);
    return arr[lo] + f * (arr[hi] - arr[lo]);
  }

  // 설계 곡면: L × h 격자 (로그 간격)
  function surface(p, nL, nH, rng, N) {
    var Ls = [], hs = [], i, j, out = { Ls: Ls, hs: hs, defl: [], stress: [], mass: [], util: [] };
    for (i = 0; i < nL; i++) Ls.push(rng.L0 * Math.pow(rng.L1 / rng.L0, i / (nL - 1)));
    for (j = 0; j < nH; j++) hs.push(rng.h0 * Math.pow(rng.h1 / rng.h0, j / (nH - 1)));
    for (j = 0; j < nH; j++) {
      var rd = [], rs = [], rm = [], ru = [];
      for (i = 0; i < nL; i++) {
        var q = Object.assign({}, p, { L: Ls[i], h: hs[j] });
        var r = analyze(q, { N: N || 80, lite: true });
        rd.push(r.stable ? r.tip : NaN); rs.push(r.stable ? r.peak : NaN); rm.push(r.mass); ru.push(r.stable ? r.util : NaN);
      }
      out.defl.push(rd); out.stress.push(rs); out.mass.push(rm); out.util.push(ru);
    }
    return out;
  }

  return {
    G0: G0, clampT: clampT, sectionProps: sectionProps, shearQb: shearQb, makeBeam: makeBeam,
    loadArrays: loadArrays, solve: solve, pcr: pcr, freq: freq, secondOrder: secondOrder,
    dlf: dlf, stepResp: stepResp, analyze: analyze, closedForm: closedForm, interp: interp, surface: surface
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BeamCalc;

/* lam.js: 적층 복합재 계산 (고전 적층 이론, 층별 최대응력, 층 제외법, 층간 전단)
   단위: 길이 mm, 응력·탄성률 MPa, 면내력 N/mm, 모멘트 N·mm/mm, 밀도 g/cm³, 평량 g/m² */
var Lam = (function () {
  'use strict';
  var D2R = Math.PI / 180, DEG = 1e-4;

  // 층 소재 기본값 (탄성률 GPa, 강도 MPa). 근거는 BEAM_07 2절
  var PLY = {
    cf_ud: { fab: false, E1: 135, E2: 10, G12: 5, nu12: 0.30, G13: 5, G23: 3.5, Xt: 1500, Xc: 1200, Yt: 50, Yc: 250, S12: 70, S13: 70, vf0: 0.60, rhof: 1.78, faw: 160, t: 0.15 },
    gf_ud: { fab: false, E1: 40, E2: 8, G12: 4, nu12: 0.25, G13: 4, G23: 3.4, Xt: 1000, Xc: 600, Yt: 30, Yc: 110, S12: 40, S13: 40, vf0: 0.60, rhof: 2.54, faw: 305, t: 0.20 },
    cf_fab: { fab: true, E1: 70, E2: 70, G12: 5, nu12: 0.10, G13: 3.5, G23: 3.5, Xt: 600, Xc: 570, Yt: 600, Yc: 570, S12: 90, S13: 60, vf0: 0.50, rhof: 1.78, faw: 200, t: 0.225 },
    gf_fab: { fab: true, E1: 25, E2: 25, G12: 4, nu12: 0.20, G13: 3.4, G23: 3.4, Xt: 440, Xc: 425, Yt: 440, Yc: 425, S12: 40, S13: 40, vf0: 0.50, rhof: 2.54, faw: 305, t: 0.24 }
  };
  var RESIN = { rho: 1.2, E: 3.5, G: 1.3 };
  var PRESETS = {
    ud0: { sym: true, rep: 10, plies: [['cf_ud', 0]] },
    cross: { sym: true, rep: 5, plies: [['cf_ud', 0], ['cf_ud', 90]] },
    quasi: { sym: true, rep: 2, plies: [['cf_ud', 0], ['cf_ud', 45], ['cf_ud', -45], ['cf_ud', 90]] },
    pm45: { sym: true, rep: 5, plies: [['cf_ud', 45], ['cf_ud', -45]] },
    fabric: { sym: true, rep: 6, plies: [['cf_fab', 0]] },
    hybrid: { sym: true, rep: 1, plies: [['cf_fab', 0, 2], ['gf_fab', 0, 6]] }
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function defaults() { return { mats: clone(PLY), resin: clone(RESIN), corr: true, lam: preset('ud0') }; }
  function preset(k) {
    var p = PRESETS[k];
    return { sym: p.sym, rep: p.rep, plies: p.plies.map(function (x) { return { m: x[0], a: x[1], n: x[2] || 1 }; }) };
  }

  // Halpin-Tsai: 기준값에서 계수를 역산한 뒤 새 체적률에 적용
  function halpin(P0, Pm, v0, v, xi) {
    var r = P0 / Pm;
    if (!(r > 1)) return P0;
    var eta = (r - 1) / (v0 * (r + xi)), den = 1 - eta * v;
    if (den < 0.08) den = 0.08;
    return Pm * (1 + xi * eta * v) / den;
  }

  // 층 소재의 유효 물성 (MPa). corr: 섬유함량 보정
  function effPly(m, resin, corr) {
    var vf = m.faw / (m.rhof * m.t * 1000), warn = null;
    if (!(vf > 0)) vf = 0;
    if (vf > 0.9) { vf = 0.9; warn = 'vfHigh'; }
    var o = { fab: !!m.fab, t: m.t, vf: vf, faw: m.faw, rhof: m.rhof,
      E1: m.E1 * 1000, E2: m.E2 * 1000, G12: m.G12 * 1000, nu12: m.nu12, G13: m.G13 * 1000, G23: m.G23 * 1000,
      Xt: m.Xt, Xc: m.Xc, Yt: m.Yt, Yc: m.Yc, S12: m.S12, S13: m.S13 };
    if (corr) {
      var v = Math.min(0.75, Math.max(0.2, vf)), k = v / m.vf0, Em = resin.E * 1000, Gm = resin.G * 1000;
      if (vf < 0.35 || vf > 0.70) warn = warn || 'vfRange';
      o.E1 *= k; o.Xt *= k; o.Xc *= k;
      if (m.fab) { o.E2 *= k; o.Yt *= k; o.Yc *= k; } else o.E2 = halpin(o.E2, Em, m.vf0, v, 2);
      o.G12 = halpin(o.G12, Gm, m.vf0, v, 1);
      o.G13 = halpin(o.G13, Gm, m.vf0, v, 1);
      o.G23 = halpin(o.G23, Gm, m.vf0, v, 1);
    }
    o.rho = vf * m.rhof + (1 - vf) * resin.rho;
    o.warn = warn;
    return o;
  }

  function expand(lam) {
    var seq = [], i, r, rep = Math.max(1, Math.round(lam.rep || 1));
    for (r = 0; r < rep; r++) for (i = 0; i < lam.plies.length; i++) for (var c = Math.max(1, Math.round(lam.plies[i].n || 1)); c > 0; c--) seq.push({ m: lam.plies[i].m, a: lam.plies[i].a });
    if (lam.sym) for (i = seq.length - 1; i >= 0; i--) seq.push({ m: seq[i].m, a: seq[i].a });
    return seq;
  }

  function label(lam) {
    var multi = false, i, short = { cf_ud: 'C', gf_ud: 'G', cf_fab: 'Cf', gf_fab: 'Gf' };
    for (i = 1; i < lam.plies.length; i++) if (lam.plies[i].m !== lam.plies[0].m) multi = true;
    var s = '[' + lam.plies.map(function (p) { return (multi ? short[p.m] : '') + p.a + (p.n > 1 ? '×' + Math.round(p.n) : ''); }).join('/') + ']';
    var rep = Math.max(1, Math.round(lam.rep || 1));
    return s + (rep > 1 ? rep : '') + (lam.sym ? 's' : '');
  }

  function qbar(p, a, d) {
    var E1 = p.E1 * d[0], E2 = p.E2 * d[1], G = p.G12 * d[2], nu = p.nu12 * d[0];
    var den = 1 - nu * nu * E2 / E1, Q11 = E1 / den, Q22 = E2 / den, Q12 = nu * E2 / den, Q66 = G;
    var c = Math.cos(a * D2R), s = Math.sin(a * D2R), c2 = c * c, s2 = s * s;
    return { Q: [Q11, Q12, Q22, Q66], c: c, s: s,
      b: [Q11 * c2 * c2 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * s2 * s2,
        (Q11 + Q22 - 4 * Q66) * s2 * c2 + Q12 * (s2 * s2 + c2 * c2),
        Q11 * s2 * s2 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * c2 * c2,
        (Q11 - Q12 - 2 * Q66) * s * c2 * c + (Q12 - Q22 + 2 * Q66) * s2 * s * c,
        (Q11 - Q12 - 2 * Q66) * s2 * s * c + (Q12 - Q22 + 2 * Q66) * s * c2 * c,
        (Q11 + Q22 - 2 * Q12 - 2 * Q66) * s2 * c2 + Q66 * (s2 * s2 + c2 * c2)] }; // 11,12,22,16,26,66
  }

  function inv(M) {
    var n = M.length, A = [], i, j, k;
    for (i = 0; i < n; i++) { A.push(M[i].slice()); for (j = 0; j < n; j++) A[i].push(i === j ? 1 : 0); }
    for (i = 0; i < n; i++) {
      var p = i;
      for (k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
      var tmp = A[i]; A[i] = A[p]; A[p] = tmp;
      var d = A[i][i];
      for (j = 0; j < 2 * n; j++) A[i][j] /= d;
      for (k = 0; k < n; k++) if (k !== i) { var f = A[k][i]; if (f !== 0) for (j = 0; j < 2 * n; j++) A[k][j] -= f * A[i][j]; }
    }
    return A.map(function (r) { return r.slice(n); });
  }

  function sym3(v) { return [[v[0], v[1], v[3]], [v[1], v[2], v[4]], [v[3], v[4], v[5]]]; }

  // 강성 조립. plies[i].d = [dE1, dE2, dG] 손상 계수
  function assemble(L) {
    var A = [0, 0, 0, 0, 0, 0], B = [0, 0, 0, 0, 0, 0], D = [0, 0, 0, 0, 0, 0], i, j;
    for (i = 0; i < L.plies.length; i++) {
      var p = L.plies[i], q = qbar(p.p, p.a, p.d), zm = (p.z0 + p.z1) / 2, t = p.z1 - p.z0;
      p.q = q;
      for (j = 0; j < 6; j++) { A[j] += q.b[j] * t; B[j] += q.b[j] * t * zm; D[j] += q.b[j] * (t * zm * zm + t * t * t / 12); }
    }
    var a = sym3(A), b = sym3(B), d = sym3(D), M = [];
    for (i = 0; i < 3; i++) M.push(a[i].concat(b[i]));
    for (i = 0; i < 3; i++) M.push(b[i].concat(d[i]));
    L.A = A; L.B = B; L.D = D; L.inv = inv(M);
    return L;
  }

  // 적층 만들기. cfg = { mats, resin, corr, lam }
  function build(cfg) {
    var seq = expand(cfg.lam), eff = {}, k, h = 0, i, warn = [];
    for (k in cfg.mats) { eff[k] = effPly(cfg.mats[k], cfg.resin, cfg.corr); }
    for (i = 0; i < seq.length; i++) h += eff[seq[i].m].t;
    var z = h / 2, plies = [], mass = 0, fib = 0, vol = 0, Ks = 0, used = {};
    for (i = 0; i < seq.length; i++) {
      var p = eff[seq[i].m], c = Math.cos(seq[i].a * D2R), s = Math.sin(seq[i].a * D2R);
      plies.push({ m: seq[i].m, a: seq[i].a, p: p, z1: z, z0: z - p.t, d: [1, 1, 1] });
      z -= p.t; mass += p.rho * p.t * 1000; fib += p.faw; vol += p.faw / p.rhof / 1000;
      Ks += (p.G13 * c * c + p.G23 * s * s) * p.t; used[seq[i].m] = 1;
    }
    for (k in used) if (eff[k].warn) warn.push(eff[k].warn + ':' + k);
    var L = assemble({ plies: plies, h: h, n: plies.length, eff: eff });
    var I = L.inv, sc = Math.max(Math.abs(L.A[0]), Math.abs(L.A[2])) * h, bmax = 0, j;
    for (j = 0; j < 6; j++) bmax = Math.max(bmax, Math.abs(L.B[j]));
    L.symmetric = bmax < 1e-9 * sc;
    L.balanced = Math.abs(L.A[3]) + Math.abs(L.A[4]) < 1e-9 * Math.abs(L.A[0]);
    L.Ex = 1 / (I[0][0] * h); L.Ey = 1 / (I[1][1] * h); L.Gxy = 1 / (I[2][2] * h); L.nuxy = -I[1][0] / I[0][0];
    L.Ef = 12 / (I[3][3] * h * h * h); L.EIw = 1 / I[3][3];   // 폭당 굽힘 강성
    L.Ks = 5 / 6 * Ks; L.Gz = Ks / h;                          // 폭당 횡전단 강성, 평균 횡전단 탄성률
    L.rho = mass / (h * 1000); L.areal = mass;                 // g/cm³, g/m²
    L.wf = fib / mass; L.vf = vol / h;
    L.warn = warn; L.label = label(cfg.lam);
    return L;
  }

  // 단위 하중(load: 6성분)에서 층별 파손 지수. 반환: { e: 변형 6성분, list: [{i, mode, f, s1, s2, t12, z}] }
  function plyState(L, load) {
    var I = L.inv, e = [0, 0, 0, 0, 0, 0], i, j, list = [];
    for (i = 0; i < 6; i++) for (j = 0; j < 6; j++) e[i] += I[i][j] * load[j];
    for (i = 0; i < L.plies.length; i++) {
      var p = L.plies[i], q = p.q, c = q.c, s = q.s, pp = p.p, zs = [p.z1, p.z0], k;
      for (k = 0; k < 2; k++) {
        var z = zs[k], ex = e[0] + z * e[3], ey = e[1] + z * e[4], gxy = e[2] + z * e[5];
        var e1 = ex * c * c + ey * s * s + gxy * s * c, e2 = ex * s * s + ey * c * c - gxy * s * c, g12 = 2 * (ey - ex) * s * c + gxy * (c * c - s * s);
        var s1 = q.Q[0] * e1 + q.Q[1] * e2, s2 = q.Q[1] * e1 + q.Q[2] * e2, t12 = q.Q[3] * g12;
        var f1 = s1 > 0 ? s1 / pp.Xt : -s1 / pp.Xc, f2 = s2 > 0 ? s2 / pp.Yt : -s2 / pp.Yc, f6 = Math.abs(t12) / pp.S12;
        list.push({ i: i, k: k, z: z, s1: s1, s2: s2, t12: t12, sx: q.b[0] * ex + q.b[1] * ey + q.b[3] * gxy,
          f: [p.d[0] === 1 ? f1 : 0, p.d[1] === 1 ? f2 : 0, p.d[2] === 1 ? f6 : 0], raw: [f1, f2, f6] });
      }
    }
    return { e: e, list: list };
  }

  function firstFail(L, load) {
    var st = plyState(L, load), best = { f: 0 }, i, m;
    for (i = 0; i < st.list.length; i++) for (m = 0; m < 3; m++) if (st.list[i].f[m] > best.f) best = { f: st.list[i].f[m], i: st.list[i].i, mode: m, s: st.list[i] };
    best.lambda = best.f > 0 ? 1 / best.f : Infinity;
    return best;
  }

  // 층 제외법. ci: 제어 변형 성분(0 인장, 3 굽힘, 2 전단). 반환: 곡선 [변형, 하중], 사건 목록
  function progressive(L0, load, ci) {
    var L = { plies: L0.plies.map(function (p) { return { m: p.m, a: p.a, p: p.p, z0: p.z0, z1: p.z1, d: [1, 1, 1] }; }), h: L0.h };
    assemble(L);
    var pts = [[0, 0]], ev = [], ecur = 0, maxLoad = 0, maxE = 0, it, lim = 3 * L.plies.length + 6;
    for (it = 0; it < lim; it++) {
      var st = plyState(L, load), c = Math.abs(st.e[ci]), fmax = 0, i, m;
      for (i = 0; i < st.list.length; i++) for (m = 0; m < 3; m++) if (st.list[i].f[m] > fmax) fmax = st.list[i].f[m];
      if (!(fmax > 0)) break;
      var es = Math.max(ecur, c / fmax), P = es / c;
      if (es * (ci === 3 ? L.h / 2 : 1) > 0.25) break;
      pts.push([es, P]);
      if (P > maxLoad) { maxLoad = P; maxE = es; }
      var hit = {};
      for (i = 0; i < st.list.length; i++) for (m = 0; m < 3; m++) {
        var x = st.list[i];
        if (x.f[m] * P >= 1 - 1e-9) {
          var key = x.i + ':' + m;
          if (!hit[key]) { hit[key] = 1; ev.push({ e: es, P: P, i: x.i, mode: m, sign: m === 2 ? 0 : (m === 0 ? x.s1 : x.s2) > 0 ? 1 : -1, a: L.plies[x.i].a, m: L.plies[x.i].m }); }
        }
      }
      for (var k in hit) {
        var pi = +k.split(':')[0], md = +k.split(':')[1], pl = L.plies[pi];
        if (pl.p.fab) pl.d[md] = DEG;
        else if (md === 0) pl.d = [DEG, DEG, DEG];
        else { pl.d[1] = DEG; pl.d[2] = DEG; }
      }
      assemble(L);
      ecur = es;
      var c2 = Math.abs(plyState(L, load).e[ci]), P2 = es / c2;
      pts.push([es, P2]);
      if (P2 < 0.01 * maxLoad) break;
    }
    // 최대 이후 하중이 절반 아래로 떨어지면 곡선을 끊음
    var cut = pts.length, seen = false;
    for (it = 0; it < pts.length; it++) { if (pts[it][1] >= maxLoad * (1 - 1e-12)) seen = true; else if (seen && pts[it][1] < 0.5 * maxLoad) { cut = it + 1; break; } }
    return { pts: pts.slice(0, cut), ev: ev, fpf: ev.length ? { e: ev[0].e, P: ev[0].P, ev: ev[0] } : null, ult: { e: maxE, P: maxLoad } };
  }

  // 층간 전단: 단위 전단력(폭당 1 N/mm)에서의 τxz 분포. 반환 { z:[], tau:[], rmax, iMax, tmax }
  function interlaminar(L) {
    var I = L.inv, e = [I[0][3], I[1][3], I[2][3], I[3][3], I[4][3], I[5][3]], g = 0, i, zs = [], ts = [], rmax = 0, iMax = 0, tmax = 0;
    // 아래에서 위로 적분
    for (i = L.plies.length - 1; i >= 0; i--) {
      var p = L.plies[i], b = p.q.b, a0 = b[0] * e[0] + b[1] * e[1] + b[3] * e[2], a1 = b[0] * e[3] + b[1] * e[4] + b[3] * e[5];
      var F = function (z) { return a0 * (z - p.z0) + a1 * (z * z - p.z0 * p.z0) / 2; }; // eslint-disable-line
      var cand = [p.z0, p.z1], zst = a1 !== 0 ? -a0 / a1 : NaN, k;
      if (zst > p.z0 && zst < p.z1) cand.push(zst);
      for (k = 0; k < cand.length; k++) {
        var tv = Math.abs(g + F(cand[k])), r = tv / p.p.S13;
        if (r > rmax) { rmax = r; iMax = i; }
        if (tv > tmax) tmax = tv;
      }
      for (k = 0; k <= 4; k++) { var zz = p.z0 + (p.z1 - p.z0) * k / 4; zs.push(zz); ts.push(Math.abs(g + F(zz))); }
      g += F(p.z1);
    }
    return { z: zs, tau: ts, rmax: rmax, iMax: iMax, tmax: tmax, resid: Math.abs(g) };
  }

  // 시험별 예상값. geo: { tw, flexB, flexSpan, sbsB, sbsSpan, vW }
  function tests(L, geo) {
    var h = L.h, out = {};
    var T = progressive(L, [1, 0, 0, 0, 0, 0], 0);
    out.tension = { E: L.Ex, nu: L.nuxy, fpf: T.fpf ? T.fpf.P / h : 0, fpfE: T.fpf ? T.fpf.e : 0, ult: T.ult.P / h, ultE: T.ult.e,
      curve: T.pts.map(function (q) { return [q[0], q[1] / h]; }), ev: T.ev, Pult: T.ult.P * geo.tw };
    var C = progressive(L, [-1, 0, 0, 0, 0, 0], 0), lg = geo.compLg || 13;
    out.compFpf = C.fpf ? C.fpf.P / h : 0;
    out.comp = { E: L.Ex, fpf: out.compFpf, fpfE: C.fpf ? C.fpf.e : 0, ult: C.ult.P / h, ultE: C.ult.e, ev: C.ev,
      curve: C.pts.map(function (q) { return [q[0], q[1] / h]; }), Pult: C.ult.P * (geo.compW || 13),
      buck: 1 / (3 * lg * lg / (Math.PI * Math.PI * L.Ef * h * h) + 1.2 / L.Gz) };
    out.comp.buckFirst = out.comp.buck < out.comp.ult;
    var il = interlaminar(L), vcap = 1 / il.rmax;                 // 폭당 허용 전단력 N/mm
    out.il = il; out.sbs = 1.5 * vcap / h;                        // 겉보기 단보 강도
    var F = progressive(L, [0, 0, 0, 1, 0, 0], 3), F2 = progressive(L, [0, 0, 0, -1, 0, 0], 3);
    var b = geo.flexB, Ls = geo.flexSpan, toP = 4 * b / Ls;
    var fl = function (R) { return { fpf: R.fpf ? 6 * R.fpf.P / (h * h) : 0, ult: 6 * R.ult.P / (h * h), ev: R.ev, R: R }; }; // eslint-disable-line
    var fa = fl(F), fb = fl(F2);
    out.flex = { E: L.Ef, fpf: fa.fpf, ult: fa.ult, ev: F.ev, ultRev: fb.ult, fpfRev: fb.fpf,
      curve: F.pts.map(function (q) { var P = q[1] * toP; return [q[0] * Ls * Ls / 12 + P * Ls / (4 * L.Ks * b), P, 6 * q[1] / (h * h)]; }),
      Pult: F.ult.P * toP, Pfpf: F.fpf ? F.fpf.P * toP : 0, Pshear: 2 * b * vcap };
    out.flex.shearFirst = out.flex.Pshear < out.flex.Pult;
    out.flex.Dult = F.ult.e * Ls * Ls / 12 + out.flex.Pult * Ls / (4 * L.Ks * b);
    var sb = geo.sbsB, sL = geo.sbsSpan, Psh = 2 * sb * vcap, Pfx = 4 * sb * F.ult.P / sL;
    out.ilss = { F: out.sbs, P: Psh, Pflex: Pfx, flexFirst: Pfx < Psh,
      D: Psh * sL * sL * sL / (48 * L.EIw * sb) + Psh * sL / (4 * L.Ks * sb) };
    var S = progressive(L, [0, 0, 1, 0, 0, 0], 2);
    out.vnotch = { G: L.Gxy, fpf: S.fpf ? S.fpf.P / h : 0, ult: S.ult.P / h, ultE: S.ult.e,
      curve: S.pts.map(function (q) { return [q[0], q[1] / h]; }), ev: S.ev, Pult: S.ult.P * geo.vW };
    out.fiber = { wf: L.wf, vf: L.vf, resin: 1 - L.wf };
    return out;
  }

  // 보 해석에 넘기는 등가 물성. flat: 판을 눕힘(굽힘 강성), 아니면 벽(면내 강성)
  function beamEquiv(L, flat) {
    var h = L.h, il = interlaminar(L), o;
    if (flat) {
      var a = firstFail(L, [0, 0, 0, 1, 0, 0]), b = firstFail(L, [0, 0, 0, -1, 0, 0]), s = 6 * Math.min(a.lambda, b.lambda) / (h * h);
      o = { E: L.Ef, G: L.Gz, xt: s, xc: s, s: 1.5 / (il.rmax * h), first: a.lambda <= b.lambda ? a : b };
    } else {
      var t = firstFail(L, [1, 0, 0, 0, 0, 0]), c = firstFail(L, [-1, 0, 0, 0, 0, 0]), q = firstFail(L, [0, 0, 1, 0, 0, 0]);
      o = { E: L.Ex, G: L.Gxy, xt: t.lambda / h, xc: c.lambda / h, s: q.lambda / h, first: t.lambda <= c.lambda ? t : c };
    }
    o.rho = L.rho * 1000; o.nu = L.nuxy;
    return o;
  }

  // 규격별 시편 기본 치수 (mm). 근거·확인 수준은 BEAM_07 4.3절
  function specimens(L, opt) {
    var h = L.h, ratio = opt.ratio || 16, all0 = true, all90 = true, i;
    for (i = 0; i < L.plies.length; i++) { if (L.plies[i].a !== 0 || L.plies[i].p.fab) all0 = false; if (Math.abs(L.plies[i].a) !== 90 || L.plies[i].p.fab) all90 = false; }
    var ten = all0 ? { w: 15, len: 250, tab: 56, rec: 1.0, type: 'ud0' } : all90 ? { w: 25, len: 175, tab: 25, rec: 2.0, type: 'ud90' } : { w: 25, len: 250, tab: 0, rec: 2.5, type: 'bal' };
    ten.grip = ten.len - 2 * (ten.tab || 50);
    var thin = h < 1.6, span = thin ? 25.4 : ratio * h, over = Math.max(0.1 * span, 6.4);
    var flex = { w: 12.7, span: span, len: thin ? 50.8 : Math.ceil((span + 2 * over + 20) / 10) * 10, rate: 0.01 * span * span / (6 * h), ratio: thin ? span / h : ratio };
    var sbs = { w: 2 * h, len: 6 * h, span: 4 * h, rate: 1.0, ok: h >= 2 && h <= 6 };
    var vn = { w: 20, len: 76, notch: 4, wn: 12, ang: 90, rate: 2.0 };
    return { tension: ten, flex: flex, ilss: sbs, vnotch: vn, fiber: { w: 25, len: 25 } };
  }

  var api = { PLY: PLY, RESIN: RESIN, PRESETS: PRESETS, defaults: defaults, preset: preset, effPly: effPly, expand: expand, label: label,
    build: build, plyState: plyState, firstFail: firstFail, progressive: progressive, interlaminar: interlaminar, tests: tests,
    beamEquiv: beamEquiv, specimens: specimens, inv: inv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();

/* gl.js: 작은 WebGL 그리기 도구 (라이브러리 없음) */
var GL3 = (function () {
  'use strict';

  // ---------- 행렬 (열 우선 16칸) ----------
  function persp(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mulS(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function lookAt(eye, tgt, up) {
    var z = norm(sub(eye, tgt)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }

  // ---------- 무지개 색 (파랑 → 청록 → 초록 → 노랑 → 빨강) ----------
  function rainbow(t) {
    if (!(t > 0)) t = 0; else if (t > 1) t = 1;
    var s = t * 4, k = Math.floor(s), f = s - k;
    if (k <= 0) return [0.05, 0.25 + 0.75 * f, 1];
    if (k === 1) return [0.05, 1, 1 - f];
    if (k === 2) return [0.05 + 0.95 * f, 1, 0.05];
    if (k === 3) return [1, 1 - 0.85 * f, 0.05];
    return [1, 0.15, 0.05];
  }
  var RAINBOW_CSS = 'linear-gradient(to right, rgb(13,64,255), rgb(13,255,255), rgb(13,255,13), rgb(255,255,13), rgb(255,38,13))';

  // ---------- 정점 묶음 (위치3 법선3 색4) ----------
  function Mesh() { this.buf = new Float32Array(10 * 3 * 2048); this.n = 0; this.groups = []; }
  Mesh.prototype.clear = function () { this.n = 0; this.groups = []; };
  Mesh.prototype.v = function (p, nm, c, a) {
    if ((this.n + 1) * 10 > this.buf.length) { var nb = new Float32Array(this.buf.length * 2); nb.set(this.buf); this.buf = nb; }
    var o = this.n * 10, b = this.buf;
    b[o] = p[0]; b[o + 1] = p[1]; b[o + 2] = p[2];
    b[o + 3] = nm[0]; b[o + 4] = nm[1]; b[o + 5] = nm[2];
    b[o + 6] = c[0]; b[o + 7] = c[1]; b[o + 8] = c[2]; b[o + 9] = a === undefined ? 1 : a;
    this.n++;
  };
  var Z3 = [0, 0, 0];
  Mesh.prototype.tri = function (a, b, c, n, ca, cb, cc, al) {
    if (!n) n = norm(cross(sub(b, a), sub(c, a)));
    this.v(a, n, ca, al); this.v(b, n, cb || ca, al); this.v(c, n, cc || ca, al);
  };
  // 사각형 a-b-c-d (순서대로), 꼭짓점별 색·법선 가능
  Mesh.prototype.quad = function (a, b, c, d, n, ca, cb, cc, cd, al) {
    if (!n) n = norm(cross(sub(b, a), sub(d, a)));
    var na = n, nb2 = n, nc = n, nd = n;
    if (n.length === 4) { na = n[0]; nb2 = n[1]; nc = n[2]; nd = n[3]; }
    cb = cb || ca; cc = cc || ca; cd = cd || ca;
    this.v(a, na, ca, al); this.v(b, nb2, cb, al); this.v(c, nc, cc, al);
    this.v(a, na, ca, al); this.v(c, nc, cc, al); this.v(d, nd, cd, al);
  };
  Mesh.prototype.line = function (a, b, c, al) { this.v(a, Z3, c, al); this.v(b, Z3, c, al); };
  Mesh.prototype.group = function (center) { this.groups.push({ start: this.n, count: 0, c: center }); };
  Mesh.prototype.endGroup = function () { var g = this.groups[this.groups.length - 1]; g.count = this.n - g.start; };

  function frame(dir) {
    var d = norm(dir), up = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
    var u = norm(cross(up, d)), w = cross(d, u);
    return [d, u, w];
  }
  // 굵은 선: 점들을 잇는 관
  Mesh.prototype.tube = function (pts, r, col, sides, lit, al) {
    sides = sides || 6;
    var ringP = null, ringN = null;
    for (var i = 0; i < pts.length; i++) {
      var dir = i === 0 ? sub(pts[1], pts[0]) : (i === pts.length - 1 ? sub(pts[i], pts[i - 1]) : sub(pts[i + 1], pts[i - 1]));
      var f = frame(dir), rp = [], rn = [];
      for (var k = 0; k <= sides; k++) {
        var an = 2 * Math.PI * k / sides, n = add(mulS(f[1], Math.cos(an)), mulS(f[2], Math.sin(an)));
        rn.push(lit ? n : Z3); rp.push(add(pts[i], mulS(n, r)));
      }
      if (ringP) for (k = 0; k < sides; k++) {
        this.quad(ringP[k], rp[k], rp[k + 1], ringP[k + 1], [ringN[k], rn[k], rn[k + 1], ringN[k + 1]], col, col, col, col, al);
      }
      ringP = rp; ringN = rn;
    }
  };
  // 화살표 p0 → p1 (몸통 + 촉)
  Mesh.prototype.arrow = function (p0, p1, r, col, al, lit) {
    var d = sub(p1, p0), len = Math.sqrt(dot(d, d));
    if (len < 1e-6) return;
    var hl = Math.min(len * 0.45, r * 7), hr = r * 2.6, f = frame(d), sides = 8;
    var pm = add(p0, mulS(f[0], len - hl));
    this.tube([p0, pm], r, col, sides, lit !== false, al);
    for (var k = 0; k < sides; k++) {
      var a0 = 2 * Math.PI * k / sides, a1 = 2 * Math.PI * (k + 1) / sides;
      var n0 = add(mulS(f[1], Math.cos(a0)), mulS(f[2], Math.sin(a0))), n1 = add(mulS(f[1], Math.cos(a1)), mulS(f[2], Math.sin(a1)));
      var q0 = add(pm, mulS(n0, hr)), q1 = add(pm, mulS(n1, hr));
      var ln = lit === false ? [Z3, Z3, Z3, Z3] : null;
      this.tri(q0, q1, p1, ln ? Z3 : norm(add(add(n0, n1), mulS(f[0], 0.6))), col, col, col, al);
      this.tri(pm, q1, q0, ln ? Z3 : mulS(f[0], -1), col, col, col, al);
    }
  };
  Mesh.prototype.sphere = function (c, r, col, al) {
    var nu = 10, nv = 14;
    for (var i = 0; i < nu; i++) {
      var t0 = Math.PI * i / nu, t1 = Math.PI * (i + 1) / nu;
      for (var j = 0; j < nv; j++) {
        var p0 = 2 * Math.PI * j / nv, p1 = 2 * Math.PI * (j + 1) / nv;
        var n00 = [Math.sin(t0) * Math.cos(p0), Math.cos(t0), Math.sin(t0) * Math.sin(p0)];
        var n01 = [Math.sin(t0) * Math.cos(p1), Math.cos(t0), Math.sin(t0) * Math.sin(p1)];
        var n10 = [Math.sin(t1) * Math.cos(p0), Math.cos(t1), Math.sin(t1) * Math.sin(p0)];
        var n11 = [Math.sin(t1) * Math.cos(p1), Math.cos(t1), Math.sin(t1) * Math.sin(p1)];
        this.quad(add(c, mulS(n00, r)), add(c, mulS(n01, r)), add(c, mulS(n11, r)), add(c, mulS(n10, r)), [n00, n01, n11, n10], col, col, col, col, al);
      }
    }
  };
  Mesh.prototype.box = function (lo, hi, col, al) {
    var x0 = lo[0], y0 = lo[1], z0 = lo[2], x1 = hi[0], y1 = hi[1], z1 = hi[2];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, col, col, col, al);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, col, col, col, al);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, col, col, col, al);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, col, col, col, al);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], col, col, col, col, al);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col, col, col, col, al);
  };

  var VS = 'attribute vec3 aP;attribute vec3 aN;attribute vec4 aC;uniform mat4 uMVP;uniform mat4 uMV;varying vec4 vC;varying vec3 vN;' +
    'void main(){gl_Position=uMVP*vec4(aP,1.0);vC=aC;vN=mat3(uMV)*aN;}';
  var FS = 'precision mediump float;varying vec4 vC;varying vec3 vN;uniform float uAmb;' +
    'void main(){float l=1.0;float n2=dot(vN,vN);if(n2>0.01){vec3 n=vN*inversesqrt(n2);' +
    'float d=abs(dot(n,normalize(vec3(0.35,0.55,0.75))));l=uAmb+(1.0-uAmb)*d;}gl_FragColor=vec4(vC.rgb*l,vC.a);}';

  function View(canvas, overlay, cam) {
    this.canvas = canvas; this.overlay = overlay;
    this.home = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, tgt: cam.tgt || [0, 0, 0] };
    this.cam = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, tgt: (cam.tgt || [0, 0, 0]).slice() };
    this.op = new Mesh(); this.al = new Mesh(); this.ln = new Mesh();
    this.labels = []; this.pool = []; this.dirty = true; this.onChange = null; this.bg = [0, 0, 0];
    this.narrow = false;
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    this.gl = gl;
    if (gl) this.init();
    this.bind();
  }
  View.prototype.init = function () {
    var gl = this.gl;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.gl = null; return; }
    gl.useProgram(pr);
    this.loc = { p: gl.getAttribLocation(pr, 'aP'), n: gl.getAttribLocation(pr, 'aN'), c: gl.getAttribLocation(pr, 'aC'),
      mvp: gl.getUniformLocation(pr, 'uMVP'), mv: gl.getUniformLocation(pr, 'uMV'), amb: gl.getUniformLocation(pr, 'uAmb') };
    this.vbo = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  };
  View.prototype.bind = function () {
    var self = this, cv = this.canvas, drag = null, pts = {}, pinch = 0;
    function ch() { self.dirty = true; if (self.onChange) self.onChange(); }
    cv.addEventListener('pointerdown', function (e) {
      pts[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pts);
      if (ids.length === 2) { pinch = Math.hypot(pts[ids[0]][0] - pts[ids[1]][0], pts[ids[0]][1] - pts[ids[1]][1]); drag = null; }
      else { drag = [e.clientX, e.clientY]; }
      try { cv.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!pts[e.pointerId]) return;
      pts[e.pointerId] = [e.clientX, e.clientY];
      var ids = Object.keys(pts);
      if (ids.length === 2) {
        var d = Math.hypot(pts[ids[0]][0] - pts[ids[1]][0], pts[ids[0]][1] - pts[ids[1]][1]);
        if (pinch > 0 && d > 0) { self.cam.dist = Math.min(12, Math.max(1.2, self.cam.dist * pinch / d)); ch(); }
        pinch = d; return;
      }
      if (!drag) return;
      var dx = e.clientX - drag[0], dy = e.clientY - drag[1];
      drag = [e.clientX, e.clientY];
      self.cam.yaw -= dx * 0.008;
      if (!self.narrow || e.pointerType === 'mouse') self.cam.pitch = Math.min(1.45, Math.max(-1.45, self.cam.pitch + dy * 0.008));
      ch();
    });
    function up(e) { delete pts[e.pointerId]; drag = null; pinch = 0; }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.cam.dist = Math.min(12, Math.max(1.2, self.cam.dist * Math.exp(e.deltaY * 0.0012))); ch();
    }, { passive: false });
    cv.addEventListener('dblclick', function () { self.resetCam(); });
  };
  View.prototype.resetCam = function () {
    this.cam.yaw = this.home.yaw; this.cam.pitch = this.home.pitch; this.cam.dist = this.home.dist; this.cam.tgt = this.home.tgt.slice();
    this.dirty = true; if (this.onChange) this.onChange();
  };
  View.prototype.matrices = function () {
    var c = this.cam, w = this.canvas.width || 1, h = this.canvas.height || 1, asp = w / h;
    var dist = c.dist * (asp < 1.35 ? 1.35 / asp : 1);
    var eye = [c.tgt[0] + dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tgt[1] + dist * Math.sin(c.pitch), c.tgt[2] + dist * Math.cos(c.pitch) * Math.cos(c.yaw)];
    var mv = lookAt(eye, c.tgt, [0, 1, 0]), pj = persp(32 * Math.PI / 180, asp, 0.1, 60);
    return { mv: mv, mvp: mul(pj, mv), eye: eye };
  };
  View.prototype.resize = function () {
    var cv = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(cv.clientWidth * dpr)), h = Math.max(2, Math.round(cv.clientHeight * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; this.dirty = true; }
  };
  View.prototype.render = function () {
    this.resize();
    if (!this.dirty) return;
    this.dirty = false;
    var m = this.matrices();
    this.m = m;
    var gl = this.gl;
    if (gl) {
      var L = this.loc;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(this.bg[0], this.bg[1], this.bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(L.mvp, false, new Float32Array(m.mvp));
      gl.uniformMatrix4fv(L.mv, false, new Float32Array(m.mv));
      gl.uniform1f(L.amb, 0.52);
      var self = this;
      var bindBuf = function (i, mesh) {
        gl.bindBuffer(gl.ARRAY_BUFFER, self.vbo[i]);
        gl.bufferData(gl.ARRAY_BUFFER, mesh.buf.subarray(0, mesh.n * 10), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(L.p); gl.vertexAttribPointer(L.p, 3, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(L.n); gl.vertexAttribPointer(L.n, 3, gl.FLOAT, false, 40, 12);
        gl.enableVertexAttribArray(L.c); gl.vertexAttribPointer(L.c, 4, gl.FLOAT, false, 40, 24);
      };
      gl.disable(gl.BLEND); gl.depthMask(true);
      if (this.op.n) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); bindBuf(0, this.op); gl.drawArrays(gl.TRIANGLES, 0, this.op.n); gl.disable(gl.POLYGON_OFFSET_FILL); }
      if (this.ln.n) { bindBuf(2, this.ln); gl.drawArrays(gl.LINES, 0, this.ln.n); }
      if (this.al.n) {
        gl.enable(gl.BLEND); gl.depthMask(false);
        bindBuf(1, this.al);
        var gs = this.al.groups, eye = m.eye;
        if (gs.length) {
          gs.forEach(function (g) { var d = sub(g.c, eye); g.d = dot(d, d); });
          gs.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (g) { if (g.count) gl.drawArrays(gl.TRIANGLES, g.start, g.count); });
        } else gl.drawArrays(gl.TRIANGLES, 0, this.al.n);
        gl.depthMask(true); gl.disable(gl.BLEND);
      }
    }
    this.layoutLabels();
  };
  View.prototype.project = function (p) {
    var m = this.m.mvp, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) return null;
    return [(x / w * 0.5 + 0.5) * this.canvas.clientWidth, (1 - (y / w * 0.5 + 0.5)) * this.canvas.clientHeight];
  };
  // labels: [{p:[x,y,z], text, cls, ax, ay}]  ax/ay: 정렬 (-1 왼쪽/위, 0 가운데, 1 오른쪽/아래)
  View.prototype.layoutLabels = function () {
    var ov = this.overlay, i, W = this.canvas.clientWidth, H = this.canvas.clientHeight, vis = [], lb, el, s;
    for (i = 0; i < this.labels.length; i++) {            // 1) 글자 쓰기
      lb = this.labels[i]; el = this.pool[i];
      if (!el) { el = document.createElement('span'); ov.appendChild(el); this.pool[i] = el; }
      s = this.project(lb.p);
      if (!s || s[0] < -30 || s[0] > W + 30 || s[1] < -30 || s[1] > H + 30) { el.style.display = 'none'; continue; }
      el.style.display = '';
      if (el.textContent !== lb.text) el.textContent = lb.text;
      var cn = 'lb ' + (lb.cls || '');
      if (el.className !== cn) el.className = cn;
      vis.push([el, lb, s]);
    }
    for (i = 0; i < vis.length; i++) { vis[i].push(vis[i][0].offsetWidth, vis[i][0].offsetHeight); }   // 2) 크기 읽기
    for (i = 0; i < vis.length; i++) {                    // 3) 자리 잡기 (창 밖으로 나가지 않게)
      el = vis[i][0]; lb = vis[i][1]; s = vis[i][2];
      var w = vis[i][3], h = vis[i][4], x = s[0] + (lb.dx || 0), y = s[1] + (lb.dy || 0);
      var left = x - (lb.ax === 1 ? 0 : (lb.ax === -1 ? w : w / 2)), top = y - (lb.ay === 1 ? 0 : (lb.ay === -1 ? h : h / 2));
      left = Math.max(2, Math.min(W - w - 2, left)); top = Math.max(2, Math.min(H - h - 2, top));
      el.style.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px)';
    }
    for (i = this.labels.length; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  };

  return { View: View, Mesh: Mesh, rainbow: rainbow, RAINBOW_CSS: RAINBOW_CSS, add: add, sub: sub, mulS: mulS, norm: norm, cross: cross, dot: dot };
})();

/* i18n.js: 문구 사전 (키: [한국어, English]) + 숫자 표기 */
var I18N = {
  title: ['물성시편 설계 및 제작', 'Coupon Design & Fabrication'],
  tagline: ['외팔보 실시간 해석', 'Live cantilever analysis'], siteName: ['복합소재 통합 시뮬레이션-가공 툴', 'Composite simulation and machining tool'],
  btnTour: ['둘러보기', 'Tour'],
  btnPreset: ['검산 조건', 'Check case'],
  btnPresetTip: ['S235, 직사각형 30 × 60, L 1000, 등분포 4500 N', 'S235, rectangle 30 × 60, L 1000, uniform 4500 N'],
  btnCsv: ['CSV 내보내기', 'Export CSV'],
  btnLang: ['🌐 English', '🌐 한국어'],
  themeToLight: ['밝은 바탕', 'Light'],
  themeToDark: ['어두운 바탕', 'Dark'],
  btnNotes: ['식과 가정', 'Formulas and assumptions'],
  // 수치 칸
  kTip: ['끝단 처짐 δ', 'Tip deflection δ'],
  kPeakVm: ['최대 von Mises 응력', 'Peak von Mises stress'],
  kPeakSig: ['최대 굽힘응력', 'Peak bending stress'],
  kSF: ['안전율', 'Safety factor'],
  kTau: ['최대 전단응력 τ', 'Max shear stress τ'],
  kReact: ['고정단 반력', 'Root reaction'],
  kFreq: ['1차 고유진동수', 'First natural frequency'],
  kMass: ['질량', 'Mass'],
  kBuck: ['좌굴 (축력 ÷ Pcr)', 'Buckling (axial ÷ Pcr)'],
  sLimitOk: ['한계 이내', 'within limit'],
  sLimitNg: ['한계 초과', 'over limit'],
  sStiff: ['강성 k', 'stiffness k'],
  sAt: ['위치 x =', 'at x ='],
  sGov: ['지배 기준', 'governed by'],
  gov_yield: ['항복', 'yield'],
  gov_tension: ['인장 강도', 'tensile strength'],
  gov_compression: ['압축 강도', 'compressive strength'],
  gov_shear: ['층간 전단 강도', 'interlaminar shear'],
  sShearShare: ['전단 처짐 비중', 'shear share of δ'],
  sMoment: ['모멘트 M0', 'moment M0'],
  sDlf: ['계단 하중 최대', 'step-load peak'],
  sEnergy: ['변형 에너지', 'strain energy'],
  sPcr: ['Pcr 면내 / 면외', 'Pcr in-plane / out-of-plane'],
  pcrIn: ['면내', 'in'],
  pcrOut: ['면외', 'out'],
  unstableShort: ['불안정', 'Unstable'],
  sAmp: ['2차 효과', 'second-order'],
  sUnstable: ['불안정: 축력이 좌굴 하중 이상', 'Unstable: axial load reaches buckling'],
  chipOk: ['적합', 'OK'],
  chipWarn: ['주의', 'Caution'],
  chipBad: ['초과', 'Over'],
  // 창
  vStress: ['응력', 'Stress'],
  vDiag: ['선도', 'Diagrams'],
  vSect: ['단면', 'Section'],
  vSurf: ['설계 곡면', 'Design surface'],
  vMax: ['확대', 'Expand'],
  vMin: ['되돌리기', 'Restore'],
  vHint: ['끌기: 회전, 휠: 확대, 두 번 누르기: 처음 시점', 'Drag to rotate, wheel to zoom, double-click to reset'],
  exag: ['변형 배율', 'Deformation scale'],
  slow: ['느린 재생', 'slow motion'],
  noGL: ['이 환경에서는 3D 표시(WebGL)를 쓸 수 없습니다. 수치 칸과 표는 그대로 동작합니다.', '3D view (WebGL) is not available here. The figures and tables still work.'],
  // 색 기준
  cVm: ['von Mises 응력', 'von Mises stress'],
  cSigma: ['굽힘응력 σx', 'Bending stress σx'],
  cTau: ['전단응력 τ', 'Shear stress τ'],
  cUtil: ['이용률 (1 = 한계)', 'Utilisation (1 = limit)'],
  secSigma: ['굽힘응력 화살표', 'Bending stress arrows'],
  secTau: ['전단응력 화살표', 'Shear stress arrows'],
  secVm: ['von Mises 색', 'von Mises colour'],
  mDefl: ['끝단 처짐', 'Tip deflection'],
  mStress: ['최대 응력', 'Peak stress'],
  mMass: ['질량', 'Mass'],
  // 3D 글자
  lFixed: ['고정단', 'Fixed end'],
  lPeak: ['최대', 'Peak'],
  lNA: ['중립축', 'Neutral axis'],
  lTop: ['윗면', 'Top'],
  lBot: ['아랫면', 'Bottom'],
  lTens: ['인장', 'tension'],
  lComp: ['압축', 'compression'],
  lNow: ['현재 설계', 'Current design'],
  lLimit: ['처짐 한계', 'Deflection limit'],
  lAllow: ['강도', 'Strength'],
  lAxisL: ['길이 L (mm)', 'Length L (mm)'],
  lAxisH: ['높이 h (mm)', 'Depth h (mm)'],
  lLog: ['로그 눈금', 'log scale'],
  dV: ['전단력 V', 'Shear V'],
  dM: ['모멘트 M', 'Moment M'],
  dTh: ['기울기 θ', 'Slope θ'],
  dW: ['처짐 w', 'Deflection w'],
  dAtX: ['단면 위치', 'Section at'],
  legUtil: ['이용률', 'Utilisation'],
  // 조작 패널
  gMat: ['재질', 'Material'],
  gSec: ['단면과 치수', 'Section and size'],
  gLoad: ['하중', 'Load'],
  gDyn: ['동적 응답과 안정', 'Dynamics and stability'],
  gView: ['표시', 'Display'],
  mat: ['재질', 'Material'],
  mat_S235: ['S235 (EN 10025-2)', 'S235 (EN 10025-2)'],
  mat_SS400: ['SS400 (KS/JIS)', 'SS400 (KS/JIS)'],
  mat_STS304: ['STS304', 'STS304 (SUS304)'],
  mat_AL6061: ['AL6061-T6', 'AL6061-T6'],
  mat_CFRP: ['CFRP 일방향 (T700S/에폭시)', 'CFRP unidirectional (T700S/epoxy)'],
  mat_custom: ['직접 입력', 'Custom'],
  matNoteMin: ['강도는 규격 최소값입니다.', 'Strength is the specified minimum.'],
  matNoteTyp: ['강도는 자료표 대표값입니다. 설계 허용값이 아닙니다.', 'Strength is a typical datasheet value, not a design allowable.'],
  matNoteCfrp: ['자료표 대표값입니다 (섬유 60 %, 섬유가 보 길이 방향). 설계 허용값이 아닙니다.', 'Typical datasheet values (60 % fibre, fibres along the beam). Not design allowables.'],
  matNoteCustom: ['입력한 값으로 계산합니다.', 'Calculated from the values you enter.'],
  cE: ['탄성계수 E', 'Modulus E'],
  cG: ['전단 탄성계수 G', 'Shear modulus G'],
  cRho: ['밀도', 'Density'],
  cCrit: ['판정 방식', 'Criterion'],
  critVm: ['항복 (von Mises)', 'Yield (von Mises)'],
  critMax: ['최대응력 (복합소재)', 'Max stress (composite)'],
  cSy: ['항복 강도', 'Yield strength'],
  cXt: ['인장 강도', 'Tensile strength'],
  cXc: ['압축 강도', 'Compressive strength'],
  cS: ['층간 전단 강도', 'Interlaminar shear strength'],
  kind: ['단면', 'Section'],
  kind_rect: ['직사각형', 'Rectangle'],
  kind_tube: ['원형 관', 'Round tube'],
  kind_box: ['각관', 'Box'],
  kind_ibeam: ['I형', 'I-beam'],
  pL: ['길이 L', 'Length L'],
  pH: ['높이 h', 'Depth h'],
  pHd: ['지름 D', 'Diameter D'],
  pB: ['폭 b', 'Width b'],
  pT: ['두께 t', 'Thickness t'],
  pTaper: ['테이퍼 (끝단 ÷ 고정단)', 'Taper (tip ÷ root)'],
  tClamp: ['두께를 자동으로 줄였습니다:', 'Thickness limited automatically to'],
  loadCase: ['하중 종류', 'Load type'],
  lc_point: ['집중 하중', 'Point load'],
  lc_udl: ['등분포 하중', 'Uniform load'],
  lc_tri_root: ['삼각형 분포 (고정단 최대)', 'Triangular (peak at root)'],
  lc_tri_tip: ['삼각형 분포 (끝단 최대)', 'Triangular (peak at tip)'],
  pW: ['하중 합계 W', 'Total load W'],
  pA: ['집중 하중 위치 a/L', 'Point load position a/L'],
  selfW: ['자중 포함', 'Include self-weight'],
  pPax: ['축력 P (+ 압축)', 'Axial force P (+ compression)'],
  hang: ['하중을 매달린 질량으로 봄 (진동)', 'Treat load as hanging mass (vibration)'],
  pZeta: ['감쇠비 ζ', 'Damping ratio ζ'],
  anim: ['하중을 바꾸면 계단 하중 응답 재생', 'Play step-load response when the load changes'],
  btnPlay: ['계단 하중 재생', 'Play step load'],
  respTitle: ['계단 하중 응답 (정적 처짐 = 1)', 'Step-load response (static = 1)'],
  shear: ['전단 변형 포함', 'Include shear deformation'],
  limitN: ['처짐 한계', 'Deflection limit'],
  xSec: ['단면 위치 x', 'Section position x'],
  autoEx: ['변형 과장 자동', 'Auto deformation scale'],
  // 둘러보기
  tourStep: ['단계', 'Step'],
  tourPrev: ['이전', 'Back'],
  tourNext: ['다음', 'Next'],
  tourDemo: ['자동 시연', 'Play demo'],
  tourStop: ['시연 멈춤', 'Stop demo'],
  tourClose: ['닫기', 'Close'],
  tourDone: ['마침', 'Finish'],
  t1: ['한눈에 보기', 'At a glance'],
  t1b: ['4개 창이 같은 보를 서로 다른 관점으로 보여 줍니다. 응력, 선도, 단면, 설계 곡면이 함께 갱신됩니다.', 'Four views show the same beam from different angles. Stress, diagrams, section and design surface update together.'],
  t2: ['하중 걸기', 'Apply the load'],
  t2b: ['하중 크기와 종류를 바꿉니다. 처짐, 응력, 안전율이 바로 바뀌고, 하중을 한 번에 걸면(계단 하중) 처짐이 정적 값을 넘었다가 가라앉습니다.', 'Change the load size and type. Deflection, stress and safety factor follow at once; a load applied in one step overshoots the static value before settling.'],
  t3: ['단면과 재질', 'Section and material'],
  t3b: ['직사각형, 원형 관, 각관, I형과 재질 5종을 바꿔 봅니다. 같은 하중에서 응력과 질량이 어떻게 달라지는지 비교합니다.', 'Switch between rectangle, tube, box and I-beam and five materials. Compare stress and mass under the same load.'],
  t4: ['형상 다듬기', 'Shape the beam'],
  t4b: ['길이, 높이, 테이퍼를 조절합니다. 처짐은 길이의 세제곱에 비례하고, 높이의 세제곱에 반비례합니다.', 'Adjust length, depth and taper. Deflection grows with length cubed and falls with depth cubed.'],
  t5: ['설계 공간', 'Design space'],
  t5b: ['모든 길이와 높이 조합의 결과를 곡면으로 봅니다. 색은 이용률이고, 흰 점이 현재 설계입니다.', 'See every length and depth combination as a surface. Colour is utilisation; the white dot is the current design.'],
  t6: ['근거와 내보내기', 'Evidence and export'],
  t6b: ['식과 가정 패널에서 계산식, 닫힌 해 대조, 한계를 확인합니다. 결과는 CSV로 내보냅니다.', 'The formulas panel lists the equations, a closed-form check and the limits. Export the results as CSV.'],
  // 식·가정 패널
  nEq: ['계산식과 현재 값', 'Equations and current values'],
  nCheck: ['닫힌 해 대조', 'Closed-form check'],
  nAssume: ['가정과 한계', 'Assumptions and limits'],
  nSrc: ['물성 출처', 'Property sources'],
  nColItem: ['항목', 'Item'],
  nColEq: ['식', 'Equation'],
  nColVal: ['현재 값', 'Current value'],
  nCheckOn: ['균일 단면, 축력 0 조건에서 굽힘 처짐을 이론식과 비교합니다.', 'For a uniform section with no axial force, bending deflection is compared with the textbook formula.'],
  nCheckOff: ['테이퍼나 축력이 있으면 닫힌 해가 없어 수치 적분 값만 표시합니다.', 'With taper or axial force there is no closed form, so only the numerical result is shown.'],
  nTheory: ['이론', 'Theory'],
  nCalc: ['계산', 'Computed'],
  nDiff: ['차이', 'Difference'],
  nLoadPart: ['하중분', 'load part'],
  nSelfPart: ['자중분', 'self-weight part'],
  eV: ['전단력, 모멘트', 'Shear, moment'],
  eVf: ['하중을 끝단에서 고정단 쪽으로 적분', 'Integrate the load from tip to root'],
  eW: ['처짐 (굽힘)', 'Deflection (bending)'],
  eWf: ['w″ = M / (E·I), 600구간 적분', 'w″ = M / (E·I), 600 intervals'],
  eWs: ['처짐 (전단)', 'Deflection (shear)'],
  eWsf: ['w′ = V / (κ·G·A)', 'w′ = V / (κ·G·A)'],
  eSig: ['굽힘응력', 'Bending stress'],
  eSigf: ['σ = M·c / I − P / A', 'σ = M·c / I − P / A'],
  eTau: ['전단응력', 'Shear stress'],
  eTauf: ['τ = V·Q / (I·b)', 'τ = V·Q / (I·b)'],
  eVm: ['von Mises', 'von Mises'],
  eVmf: ['√(σ² + 3τ²)', '√(σ² + 3τ²)'],
  eF: ['고유진동수', 'Natural frequency'],
  eFf: ['역반복 4회 (보 질량 + 하중 질량)', 'Inverse iteration ×4 (beam mass + load mass)'],
  eD: ['동적 확대 계수 (계단 하중)', 'Dynamic load factor (step load)'],
  eDf: ['1 + exp(−ζπ / √(1 − ζ²))', '1 + exp(−ζπ / √(1 − ζ²))'],
  eP: ['좌굴 하중', 'Buckling load'],
  ePf: ['π²·E·I / (2L)², 면내(굽힘 방향) / 면외(옆 방향), 역반복', 'π²·E·I / (2L)², in-plane (bending) / out-of-plane (sideways), inverse iteration'],
  eA: ['축력 2차 효과', 'Second-order effect'],
  eAf: ['M = M0 + P·(δ − w) 반복', 'Iterate M = M0 + P·(δ − w)'],
  eU: ['변형 에너지', 'Strain energy'],
  eUf: ['∫M²/(2EI) dx + ∫V²/(2κGA) dx', '∫M²/(2EI) dx + ∫V²/(2κGA) dx'],
  eK: ['전단 계수 κ', 'Shear coefficient κ'],
  eKf: ['직사각형·각관·I형: I²/(A·∫Q²/b dy), 원형 관: Cowper 식', 'Rectangle, box, I: I²/(A·∫Q²/b dy); tube: Cowper'],
  eSec: ['단면 특성', 'Section properties'],
  itersWord: ['반복', 'iterations'],
  a1: ['선형 탄성, 미소 변형의 보 이론입니다. 길이 ÷ 높이가 5보다 작으면 오차가 커집니다.', 'Linear elastic, small-deflection beam theory. Error grows when length ÷ depth is below 5.'],
  a2: ['고정단의 응력 집중, 용접부, 볼트 구멍은 계산에 없습니다.', 'Stress concentration at the root, welds and bolt holes are not included.'],
  a3: ['횡좌굴(비틀림)과 국부 좌굴은 계산에 없습니다. I형과 얇은 각관에서 주의가 필요합니다.', 'Lateral-torsional and local buckling are not included. Take care with I-beams and thin boxes.'],
  a4: ['각관과 I형은 직각 모서리로 계산하고, 전단 계수에서 플랜지의 전단 흐름을 생략합니다.', 'Box and I sections use sharp corners; flange shear flow is left out of the shear coefficient.'],
  a5: ['원형 관의 전단 계수는 Cowper(1966) 식을 씁니다. 원문 대조는 하지 못했고 양쪽 한계값만 확인했습니다.', 'The tube shear coefficient uses the Cowper (1966) formula; only its two limits were verified, not the original paper.'],
  a6: ['고유진동수는 회전 관성과 축력의 영향을 뺐습니다.', 'Natural frequency ignores rotary inertia and axial force.'],
  a7: ['적층 복합재는 고전 적층 이론으로 등가 물성을 구합니다. 안전율은 층별 최대응력의 첫 층 파손 기준입니다.', 'Laminates use equivalent properties from classical lamination theory. The safety factor is first-ply failure by the max-stress criterion.'],
  a8: ['테이퍼는 높이(지름)만 바뀝니다. 폭과 두께는 일정합니다.', 'Taper changes depth (diameter) only. Width and thickness stay constant.'],
  a9: ['강성 k는 하중 합계 ÷ 하중에 의한 끝단 처짐입니다 (자중 제외).', 'Stiffness k is total load ÷ tip deflection due to the load (self-weight excluded).'],
  lowSlender: ['길이 ÷ 높이가 5보다 작습니다. 보 이론의 오차가 큽니다.', 'Length ÷ depth is below 5. Beam theory is inaccurate here.'],
  foot: ['예비 검토용 계산입니다. 최종 설계는 별도의 검증이 필요합니다.', 'For preliminary checks only. Final designs need independent verification.'],
  // CSV
  csvTitle: ['CSV 내보내기', 'Export CSV'],
  csvCopy: ['복사', 'Copy'],
  csvCopied: ['복사했습니다', 'Copied'],
  csvSave: ['파일로 저장', 'Save file'],
  csvSaved: ['저장했습니다', 'Saved'],
  csvDeclined: ['저장하지 않았습니다. 아래 내용을 복사해 쓰셔도 됩니다.', 'Not saved. You can copy the text below instead.'],
  csvClose: ['닫기', 'Close'],
  csvInputs: ['입력', 'Inputs'],
  csvResults: ['결과', 'Results'],
  csvTable: ['길이 방향 표', 'Along the length'],
  yes: ['예', 'yes'],
  no: ['아니오', 'no']
};

var U = (function () {
  'use strict';
  var lang = 'ko';
  function T(k) { var e = I18N[k]; if (!e) return k; return e[lang === 'ko' ? 0 : 1]; }
  function grp(s) { var p = s.split('.'); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return p.join('.'); }
  function fix(v, d) { if (!isFinite(v)) return '–'; var s = v.toFixed(d); if (parseFloat(s) === 0) s = (0).toFixed(d); return grp(s).replace('-', '−'); }
  function mm(v) { var a = Math.abs(v); return fix(v, a < 1 ? 3 : (a < 100 ? 2 : 1)); }
  function sig(v, n) {
    if (!isFinite(v)) return '–';
    if (v === 0) return '0';
    var a = Math.abs(v), e = Math.floor(Math.log10(a)), d = Math.max(0, n - 1 - e);
    return fix(v, Math.min(d, 8));
  }
  return {
    T: T, fix: fix, mm: mm, sig: sig,
    setLang: function (l) { lang = l; }, getLang: function () { return lang; }
  };
})();

/* spec.js: 플라스틱 대표값, 두께별 시편 규칙, 시편 외곽, 재단 배치, SVG 내보내기. 단위 mm, MPa, GPa
   † = 규격 원문 대조가 필요한 값 (근거: BEAM_09, BEAM_11 2절) */
Object.assign(I18N, {
  mat_PL_PP: ['플라스틱 PP', 'Plastic PP'], mat_PL_ABS: ['플라스틱 ABS', 'Plastic ABS'], mat_PL_PC: ['플라스틱 PC', 'Plastic PC'], mat_PL_PA: ['플라스틱 PA (나일론)', 'Plastic PA (nylon)'],
  mat_PL_POM: ['플라스틱 POM', 'Plastic POM'], mat_PL_PEEK: ['플라스틱 PEEK', 'Plastic PEEK'], mat_PL_PA6GF30: ['플라스틱 PA6-GF30', 'Plastic PA6-GF30'], mat_PL_custom: ['플라스틱 직접 입력', 'Plastic, custom'],
  matNotePlas: ['판재 대표값입니다. 사출 등급은 제조사 자료표 값으로 바꿔 주세요.', 'Typical sheet-stock values. Replace with the supplier data sheet for a moulding grade.'],
  plNotice: ['사출 플라스틱(무보강·단섬유)은 연속섬유 복합소재와 다릅니다. 인장 시편은 ASTM D638 아령형이고, 물성은 등급·성형 조건·흡습에 따라 달라집니다. 이 화면은 적층 계산 없이 자료표 값을 그대로 씁니다.',
    'Injection-moulded plastics (unreinforced or short-fibre) differ from continuous-fibre composites. Tension uses the ASTM D638 dumbbell, and properties depend on grade, moulding conditions and moisture. No laminate calculation is done here; data-sheet values are used as entered.'],
  pl_su: ['인장강도', 'Tensile strength'], pl_E: ['인장탄성률', 'Tensile modulus'], pl_el: ['파단 연신율', 'Elongation at break'], pl_sf: ['굴곡강도', 'Flexural strength'], pl_Ef: ['굴곡탄성률', 'Flexural modulus'],
  pl_sc: ['압축강도', 'Compressive strength'], pl_iz: ['아이조드 충격', 'Izod impact'], pl_rho: ['밀도', 'Density'],
  t_comp: ['압축', 'Compression'], t_izod: ['아이조드 D256', 'Izod D256'], t_ptension: ['인장 D638', 'Tension D638'], t_pflex: ['굴곡 D790', 'Flexure D790'], t_pcomp: ['압축 D695', 'Compression D695'],
  spType: ['형', 'Type'], spAuto: ['자동', 'auto'], spOut: ['규격 두께 범위 밖입니다.', 'Outside the thickness range of the standard.'], spJig: ['지지 지그용 시편 †', 'specimen for the support jig †'],
  spBuck: ['좌굴이 먼저 납니다. 표점 길이를 줄이거나 두께를 키워 주세요.', 'Buckling comes first. Shorten the gauge length or increase thickness.'],
  spEnergy: ['흡수 에너지', 'Absorbed energy'], spPend: ['진자', 'pendulum'], spNotch: ['노치 아래', 'under notch'], spCstd: ['압축 규격', 'Compression standard'],
  spPlen: ['판 길이 (0 = 자동)', 'Panel length (0 = auto)'], spSvg: ['SVG 저장', 'Save SVG'], spSvgTitle: ['재단 배치 SVG (1:1 mm)', 'Cutting layout SVG (1:1 mm)'], spGap: ['시편 간격', 'Gap between specimens'],
  mat_RB_50: ['고무 50A', 'Rubber 50A'], mat_RB_60: ['고무 60A', 'Rubber 60A'], mat_RB_70: ['고무 70A', 'Rubber 70A'], mat_RB_custom: ['고무 직접 입력', 'Rubber, custom'],
  matNoteRub: ['기본값은 가정값입니다. 배합마다 다르므로 자료표나 시험값으로 바꿔 주세요.', 'Defaults are assumed values. Compounds differ, so replace them with data-sheet or test values.'],
  rbNotice: ['고무는 대변형 재료입니다. 탄성률은 경도에서 환산하고(Gent 식 †), 곡선은 초기 기울기와 파단점(인장강도·신율)을 지나는 2항 Yeoh 개략선입니다. 압축·순수 전단 곡선은 인장 입력에서 환산한 값입니다. 판재 고무는 칼형 타발이 보통이며 수치 가공 때는 고정에 주의해 주세요.', 'Rubber is a large-strain material. Modulus is converted from hardness (Gent relation †). Curves are a rough two-term Yeoh fit through the initial slope and the break point (strength, elongation); compression and pure-shear curves are converted from the tensile inputs. Sheet rubber is usually die-cut; take care with hold-down when routing.'],
  rubNoBeam: ['고무는 대변형 재료라 보 해석 결과는 참고만 해 주세요.', 'Rubber is a large-strain material; treat the beam result as a rough guide only.'],
  rb_hs: ['경도', 'Hardness'], rb_su: ['인장강도', 'Tensile strength'], rb_el: ['파단 신율', 'Elongation at break'], rb_tear: ['인열강도', 'Tear strength'], rb_cs: ['압축 영구줄음', 'Compression set'], rb_rho: ['밀도', 'Density'],
  rb_m100: ['100 % 신장 응력 (환산)', '100 % modulus (converted)'], rb_G: ['전단 탄성률 (환산)', 'Shear modulus (converted)'], rb_E: ['탄성률 (환산)', 'Young modulus (converted)'],
  t_rtension: ['인장', 'Tension'], t_rtear: ['인열', 'Tear'], t_rcset: ['압축 영구줄음', 'Compression set'], t_rhard: ['경도', 'Hardness'], t_rplanar: ['순수 전단 (평면 인장)', 'Pure shear (planar tension)'], t_rucomp: ['단축 압축', 'Uniaxial compression'],
  spRstd: ['고무 규격', 'Rubber standard'], spPly: ['장 겹침', 'plies stacked'], spNonStd: ['해석용 시편 (규격 아님, 가정 치수)', 'specimen for material modelling (not a standard, assumed size)'],
  spForm: ['시편 형태', 'Specimen form'], spFlat: ['판형 (판재)', 'Flat (sheet)'], spRound: ['원형 (봉재)', 'Round (bar)'], spRdSel: ['원형 규격', 'Round specimen'], spBar: ['봉재', 'bar'],
  spRoundNote: ['원형 시편은 봉재를 선반으로 가공합니다. 판 재단 배치와 CAM 넘기기는 없습니다. 물림부 지름·길이는 가정 치수입니다.', 'Round coupons are turned from bar stock on a lathe, so there is no panel layout or CAM hand-off. Grip diameter and length are assumed sizes.'],
  spTooLong: ['판 길이가 가장 긴 시편보다 짧습니다.', 'The panel is shorter than the longest specimen.']
});

var Spec = (function () {
  'use strict';
  var T = U.T, f = U.fix;
  // 밀도 g/cm³, 강도 MPa, 탄성률 GPa, 연신율 %, 아이조드 J/m. 근거: BEAM_09 5절
  var PLAS = {
    PL_PP: { rho: 0.91, su: 37.2, E: 1.55, el: 100, sf: 45, Ef: 1.55, sc: 37.2, iz: 64 },
    PL_ABS: { rho: 1.04, su: 28.3, E: 2.03, el: 32, sf: 62.7, Ef: 2.10, sc: 28.3, iz: 411 },
    PL_PC: { rho: 1.20, su: 65.5, E: 2.38, el: 135, sf: 93.1, Ef: 2.38, sc: 86.2, iz: 747 },
    PL_PA: { rho: 1.14, su: 85.5, E: 3.24, el: 90, sf: 117.2, Ef: 2.83, sc: 85.5, iz: 64 },
    PL_POM: { rho: 1.42, su: 68.9, E: 3.10, el: 75, sf: 98.6, Ef: 2.90, sc: 68.9, iz: 80 },
    PL_PEEK: { rho: 1.32, su: 96.5, E: 3.38, el: 60, sf: 169.6, Ef: 4.07, sc: 96.5, iz: 85 },
    PL_PA6GF30: { rho: 1.36, su: 180, E: 10.0, el: 3.5, sf: 275, Ef: 8.75, sc: 180, iz: 110 },
    PL_custom: { rho: 1.04, su: 28.3, E: 2.03, el: 32, sf: 62.7, Ef: 2.10, sc: 28.3, iz: 411 }
  };
  // 고무 기본값 (가정): 경도 Shore A, 인장강도 MPa, 신율 %, 인열 kN/m, 압축 영구줄음 %, 밀도 g/cm³
  var RUB = { RB_50: { hs: 50, su: 15, el: 500, tear: 30, cs: 20, rho: 1.10 }, RB_60: { hs: 60, su: 17, el: 450, tear: 35, cs: 20, rho: 1.15 }, RB_70: { hs: 70, su: 18, el: 350, tear: 40, cs: 20, rho: 1.20 }, RB_custom: { hs: 60, su: 17, el: 450, tear: 35, cs: 20, rho: 1.15 } };
  var RKEYS = [['hs', 'Shore A'], ['su', 'MPa'], ['el', '%'], ['tear', 'kN/m'], ['cs', '%'], ['rho', 'g/cm³']];
  function gent(S) { S = Math.max(20, Math.min(90, S)); return 0.0981 * (56 + 7.62336 * S) / (0.137505 * (254 - 2.54 * S)); } // 탄성률 MPa †
  // 2항 Yeoh: W = C10(I1-3) + C20(I1-3)^2. C10 = G/2, C20는 파단점(신율, 인장강도)을 지나도록 정함 (음수면 0)
  function yeoh(rb) {
    var G = gent(rb.hs) / 3, c10 = G / 2, lb = 1 + rb.el / 100, i1 = lb * lb + 2 / lb - 3, k = 2 * (lb - 1 / (lb * lb));
    var c20 = (rb.su / k - c10) / (2 * i1); return { G: G, c10: c10, c20: c20 > 0 ? c20 : 0 };
  }
  // 공칭 응력 MPa. mode: 'u' 단축(인장·압축), 'p' 순수 전단(평면 인장)
  function rubS(y, mode, l) {
    var i1 = mode === 'p' ? l * l + 1 + 1 / (l * l) - 3 : l * l + 2 / l - 3, dw = y.c10 + 2 * y.c20 * i1;
    return 2 * dw * (mode === 'p' ? l - 1 / (l * l * l) : l - 1 / (l * l));
  }
  function rubDims(h, sh) {
    var ks = sh.rstd === 'KS', t = ks ? { std: 'KS M 6518', code: 'KS3', W: 5, G: 20, A: 20, L: 100, C: 25, R: 11 } : { std: 'ASTM D412', code: 'D412C', W: 6, G: 25, A: 33, L: 115, C: 25, R: 14 };
    return { h: h, ks: ks, ten: t, tOut: ks ? (h < 1.5 || h > 3.0) : (h < 1.3 || h > 3.3) };
  }
  function rubRows(d, rb, sh) {
    var h = d.h, t = d.ten, y = yeoh(rb), p12 = Math.ceil(12.5 / h - 1e-9), p6 = Math.ceil(6 / h - 1e-9), ks = d.ks, rows = [];
    rows.push({ key: 'rtension', code: t.code, std: t.std, shape: dog(t.L, t.C, t.W, t.A, t.R), view: 'plan', gauge: t.G, size: t.W + ' (' + t.C + ') × ' + t.L + ' × ' + f(h, 2) + (ks ? ' †' : ''), span: T('shLg') + ' ' + t.G, rate: '500 mm/min', P: rb.su * t.W * h, rem: 'R ' + t.R + ' †' + (d.tOut ? ' ' + T('spOut') : ''), n0: 5 });
    rows.push({ key: 'rtear', code: 'TEAR', std: ks ? 'KS M 6518' : 'ASTM D624 C', shape: { type: 'izod', len: ks ? 100 : 102, w: 19, d: 6.3, ha: Math.PI / 4 }, view: 'plan', size: '19 × ' + (ks ? 100 : 102) + ' × ' + f(h, 2) + ' †', span: '90°', rate: '500 mm/min', P: rb.tear * h, rem: '', n0: 5 });
    rows.push({ key: 'rcset', code: 'CSET', std: ks ? 'KS M 6518' : 'ASTM D395', shape: { type: 'circ', len: 29, w: 29 }, view: 'plan', size: 'Ø29 × 12.5', span: '25 %', rate: '–', P: null, rem: p12 + ' ' + T('spPly'), n0: 3 * p12 });
    rows.push({ key: 'rhard', code: 'HARD', std: ks ? 'KS M 6518' : 'ASTM D2240', shape: rect(30, 30), view: 'plan', size: '30 × 30 × 6 †', span: '–', rate: '–', P: null, rem: p6 + ' ' + T('spPly'), n0: p6 });
    rows.push({ key: 'rplanar', code: 'PLANAR', std: '–', shape: rect(150, 65), view: 'plan', gauge: 0, grip: 0, size: '150 × 65 × ' + f(h, 2), span: T('xGrip') + ' 15', rate: '–', P: rubS(y, 'p', 1 + Math.min(rb.el / 100, 1.5)) * 150 * h, rem: T('spNonStd'), n0: 3 });
    rows.push({ key: 'rucomp', code: 'UCOMP', std: '–', shape: { type: 'circ', len: 29, w: 29 }, view: 'plan', size: 'Ø29 × 12.5', span: '25 %', rate: '–', P: -rubS(y, 'u', 0.75) * Math.PI * 14.5 * 14.5, rem: p12 + ' ' + T('spPly') + ', ' + T('spNonStd'), n0: 3 * p12 });
    return rows;
  }
  var PKEYS = [['su', 'MPa'], ['E', 'GPa'], ['el', '%'], ['sf', 'MPa'], ['Ef', 'GPa'], ['sc', 'MPa'], ['iz', 'J/m'], ['rho', 'g/cm³']];
  // ASTM D638 형별 치수: W 평행부 폭, G 표점, A 평행부 길이, L 전체, C 물림부 폭, D 물림 간, R 필렛
  var D638 = { I: { W: 13, G: 50, A: 57, L: 165, C: 19, D: 115, R: 76, lo: 0, hi: 7 }, II: { W: 6, G: 50, A: 57, L: 183, C: 19, D: 135, R: 76, lo: 0, hi: 7 },
    III: { W: 19, G: 50, A: 57, L: 246, C: 29, D: 115, R: 76, lo: 7, hi: 14 }, IV: { W: 6, G: 25, A: 33, L: 115, C: 19, D: 65, R: 14, lo: 0, hi: 4 }, V: { W: 3.18, G: 7.62, A: 9.53, L: 63.5, C: 9.53, D: 25.4, R: 12.7, lo: 0, hi: 4 } };
  var PEND = [2.75, 5.5, 11, 22];

  function rect(len, w) { return { type: 'rect', len: len, w: w }; }
  function dog(L, C, W, A, R) { return { type: 'dog', len: L, w: C, C: C, W: W, A: A, R: R }; }

  // 외곽 경로 (원점 x, y, 배율 k)
  function outline(sp, x, y, k) {
    var L = sp.len * k, W = sp.w * k, r = function (v) { return +v.toFixed(3); }, c, d; // eslint-disable-line
    if (sp.type === 'dog') {
      var Wn = sp.W * k, R = sp.R * k; d = (W - Wn) / 2;
      var ax = Math.sqrt(Math.max(0, R * R - (R - d) * (R - d))), xg = Math.max(0, (L - sp.A * k) / 2 - ax), b = y + W, A = 'A' + r(R) + ' ' + r(R) + ' 0 0 0 ';
      return 'M' + r(x) + ' ' + r(y) + 'H' + r(x + xg) + A + r(x + xg + ax) + ' ' + r(y + d) + 'H' + r(x + L - xg - ax) + A + r(x + L - xg) + ' ' + r(y) + 'H' + r(x + L) + 'V' + r(b) +
        'H' + r(x + L - xg) + A + r(x + L - xg - ax) + ' ' + r(b - d) + 'H' + r(x + xg + ax) + A + r(x + xg) + ' ' + r(b) + 'H' + r(x) + 'Z';
    }
    if (sp.type === 'vn') {
      d = sp.d * k; c = x + L / 2;
      return 'M' + r(x) + ' ' + r(y) + 'H' + r(c - d) + 'L' + r(c) + ' ' + r(y + d) + 'L' + r(c + d) + ' ' + r(y) + 'H' + r(x + L) + 'V' + r(y + W) + 'H' + r(c + d) + 'L' + r(c) + ' ' + r(y + W - d) + 'L' + r(c - d) + ' ' + r(y + W) + 'H' + r(x) + 'Z';
    }
    if (sp.type === 'izod') {
      d = sp.d * k; c = x + L / 2; var hw = d * Math.tan(sp.ha || Math.PI / 8);
      return 'M' + r(x) + ' ' + r(y) + 'H' + r(c - hw) + 'L' + r(c) + ' ' + r(y + d) + 'L' + r(c + hw) + ' ' + r(y) + 'H' + r(x + L) + 'V' + r(y + W) + 'H' + r(x) + 'Z';
    }
    if (sp.type === 'circ') { var rr = L / 2; return 'M' + r(x) + ' ' + r(y + rr) + 'a' + r(rr) + ' ' + r(rr) + ' 0 1 0 ' + r(L) + ' 0a' + r(rr) + ' ' + r(rr) + ' 0 1 0 ' + r(-L) + ' 0Z'; }
    return 'M' + r(x) + ' ' + r(y) + 'h' + r(L) + 'v' + r(W) + 'h' + r(-L) + 'Z';
  }


  // ---------- 복합소재 ----------
  function lamDims(L, sh) {
    var d = Lam.specimens(L, { ratio: sh.ratio }), h = L.h;
    d.comp = sh.cstd === 'D3410' ? { std: 'ASTM D3410', shape: rect(140, 12), W: 12, lg: 13, tab: 63.5, mem: true }
      : sh.cstd === 'D695' ? { std: 'ASTM D695', shape: dog(79.4, 19.05, 12.7, 38.1, 38.1), W: 12.7, lg: 38.1, tab: 0, mem: true, jig: true }
        : { std: 'ASTM D6641', shape: rect(140, 13), W: 13, lg: 13, tab: 0, mem: false };
    d.geo = { tw: d.tension.w, flexB: d.flex.w, flexSpan: d.flex.span, sbsB: d.ilss.w, sbsSpan: d.ilss.span, vW: d.vnotch.wn, compW: d.comp.W, compLg: d.comp.lg };
    d.h = h; return d;
  }
  function lamRows(d, t, sh) {
    var rows = [], h = d.h, x = d.tension, P;
    rows.push({ key: 'tension', std: 'ASTM D3039', shape: rect(x.len, x.w), view: 'plan', gauge: sh.Lg, tab: x.tab, grip: x.tab || 50, size: x.w + ' × ' + x.len + ' × ' + f(h, 2) + ' †', span: T('shLg') + ' ' + sh.Lg, rate: '2 mm/min †', P: t.tension.Pult,
      rem: (x.tab ? T('shTab') + ' ' + x.tab + ' †' : T('shNoTab')) + ', ' + T('shRec') + ' ' + f(x.rec, 1) + ' †' });
    x = d.comp;
    rows.push({ key: 'comp', name: T('t_comp') + ' ' + x.std.replace('ASTM ', ''), std: x.std, shape: x.shape, view: 'plan', gauge: x.lg, tab: x.tab, grip: x.jig ? 0 : (x.shape.len - x.lg) / 2, size: x.W + ' × ' + x.shape.len + ' × ' + f(h, 2) + (x.mem ? ' †' : ''), span: T('shLg') + ' ' + x.lg, rate: '1.3 mm/min †',
      P: Math.min(t.comp.ult, t.comp.buck) * x.W * h, rem: (x.jig ? T('spJig') + ' ' : '') + (x.tab ? T('shTab') + ' ' + x.tab + ' † ' : '') + (t.comp.buckFirst ? T('spBuck') : '') });
    x = d.flex;
    rows.push({ key: 'flex', std: 'ASTM D790', shape: rect(x.len, x.w), view: 'bend', sup: x.span, size: x.w + ' × ' + x.len + ' × ' + f(h, 2), span: T('shSupport') + ' ' + f(x.span, 1) + ' (' + f(x.ratio, 0) + ':1)', rate: f(x.rate, 2) + ' mm/min', P: Math.min(t.flex.Pult, t.flex.Pshear), rem: t.flex.shearFirst ? T('shShearFirst') : '' });
    x = d.ilss;
    rows.push({ key: 'ilss', std: 'ASTM D2344', shape: rect(x.len, x.w), view: 'bend', sup: x.span, size: f(x.w, 2) + ' × ' + f(x.len, 1) + ' × ' + f(h, 2), span: T('shSupport') + ' ' + f(x.span, 1) + ' (4:1)', rate: '1.0 mm/min', P: Math.min(t.ilss.P, t.ilss.Pflex), rem: (x.ok ? '' : T('shSbsRange') + ' ') + (t.ilss.flexFirst ? T('shFlexFirst') : '') });
    x = d.vnotch;
    rows.push({ key: 'vnotch', std: 'ASTM D5379', shape: { type: 'vn', len: x.len, w: x.w, d: x.notch }, view: 'plan', size: x.w + ' † × ' + x.len + ' × ' + f(h, 2), span: T('shNotchW') + ' ' + x.wn + ' †', rate: '2 mm/min †', P: t.vnotch.Pult, rem: '90°, ' + T('shDepth') + ' ' + x.notch });
    rows.push({ key: 'fiber', std: 'ASTM D3171', shape: rect(25, 25), view: 'none', size: '25 × 25 × ' + f(h, 2), span: '–', rate: '–', P: null, rem: '', n0: 3 });
    return rows;
  }

  // ---------- 플라스틱 ----------
  function plasDims(h, sh) {
    var ty = sh.d638 && sh.d638 !== 'auto' ? sh.d638 : (h > 7 ? 'III' : 'I'), g = D638[ty], thin = h < 1.6, span = thin ? 25.4 : 16 * h;
    var fl = { w: 12.7, span: span, len: thin ? 50.8 : Math.max(127, Math.ceil((span * 1.2 + 20) / 10) * 10), rate: 0.01 * span * span / (6 * h) };
    var cp = h >= 12.7 ? { shape: rect(25.4, 12.7), W: 12.7, T: 12.7, lg: 25.4, note: '' } : h >= 3.2 ? { shape: rect(Math.round(39 * h) / 10, 12.7), W: 12.7, T: h, lg: Math.round(39 * h) / 10, note: '†' }
      : { shape: dog(79.4, 19.05, 12.7, 38.1, 38.1), W: 12.7, T: h, lg: 38.1, note: T('spJig'), jig: true };
    return { h: h, type: ty, g: g, tOut: h <= g.lo || h > g.hi || h < 1 || h > 14, flex: fl, comp: cp, izOut: h < 3.0 || h > 12.7 };
  }
  function plasRows(d, pl, sh) {
    var rows = [], h = d.h, g = d.g, x = d.flex, e = pl.iz * h / 1000, pend = PEND[PEND.length - 1], i;
    for (i = 0; i < PEND.length; i++) if (e <= 0.85 * PEND[i]) { pend = PEND[i]; break; }
    rows.push({ key: 'ptension', std: 'ASTM D638', shape: dog(g.L, g.C, g.W, g.A, g.R), view: 'plan', gauge: g.G, size: T('spType') + ' ' + d.type + ': ' + g.W + ' (' + g.C + ') × ' + g.L + ' × ' + f(h, 2), span: T('shLg') + ' ' + g.G + ', ' + T('xGrip') + ' ' + g.D, rate: '5 mm/min', P: pl.su * g.W * h,
      rem: 'R ' + g.R + ' †' + (d.tOut ? ' ' + T('spOut') : '') });
    rows.push({ key: 'pcomp', std: 'ASTM D695', shape: d.comp.shape, view: 'plan', gauge: d.comp.jig ? d.comp.lg : 0, size: d.comp.W + ' × ' + f(d.comp.shape.len, 1) + ' × ' + f(d.comp.T, 2), span: '–', rate: '1.3 mm/min †', P: pl.sc * d.comp.W * d.comp.T, rem: d.comp.note });
    rows.push({ key: 'pflex', std: 'ASTM D790', shape: rect(x.len, x.w), view: 'bend', sup: x.span, size: x.w + ' × ' + f(x.len, 1) + ' × ' + f(h, 2), span: T('shSupport') + ' ' + f(x.span, 1) + ' (16:1)', rate: f(x.rate, 2) + ' mm/min', P: 2 * x.w * h * h * pl.sf / (3 * x.span), rem: '' });
    rows.push({ key: 'izod', std: 'ASTM D256', shape: { type: 'izod', len: 63.5, w: 12.7, d: 2.54 }, view: 'plan', size: '12.7 × 63.5 × ' + f(h, 2), span: T('spNotch') + ' 10.16', rate: '–', P: null, energy: e, pend: pend,
      rem: T('spEnergy') + ' ' + f(e, 2) + ' J (' + T('spPend') + ' ' + pend + ' J †), 45° †, R 0.25' + (d.izOut ? '. ' + T('spOut') : '') });
    return rows;
  }
  // 금속 원형 인장 시편 (봉재, 선반 가공). D 평행부 지름, G 표점, A 평행부 길이, R 어깨 반지름, C·B 물림부 지름·길이(가정)
  // ASTM E8 원형은 표점 4D. 12.5 외의 소형 치수와 KS 4호는 원문 대조 필요 †
  var ROUND = {
    E8_12: { std: 'ASTM E8', name: 'Ø12.5', D: 12.5, G: 50, A: 56, R: 10, C: 20, B: 35 },
    E8_9: { std: 'ASTM E8', name: 'Ø9 †', D: 9, G: 36, A: 45, R: 8, C: 14, B: 30 },
    E8_6: { std: 'ASTM E8', name: 'Ø6 †', D: 6, G: 24, A: 30, R: 6, C: 10, B: 25 },
    E8_4: { std: 'ASTM E8', name: 'Ø4 †', D: 4, G: 16, A: 20, R: 4, C: 8, B: 20 },
    E8_2: { std: 'ASTM E8', name: 'Ø2.5 †', D: 2.5, G: 10, A: 16, R: 2, C: 6, B: 15 },
    KS4: { std: 'KS B 0801', name: '4호 Ø14 †', D: 14, G: 50, A: 60, R: 15, C: 20, B: 40 },
    KS10: { std: 'KS B 0801', name: '10호 Ø12.5', D: 12.5, G: 50, A: 60, R: 15, C: 20, B: 40 }
  };
  function roundRow(key, su) {
    var q = ROUND[key] || ROUND.E8_12, d = (q.C - q.D) / 2, ax = Math.sqrt(Math.max(0, q.R * q.R - (q.R - d) * (q.R - d))), L = Math.ceil((q.A + 2 * ax + 2 * q.B) / 5) * 5, sp = dog(L, q.C, q.D, q.A, q.R);
    return { key: 'e8', code: 'ROUND', std: q.std, shape: sp, view: 'plan', gauge: q.G, round: q, size: 'Ø' + q.D + ' (Ø' + q.C + ') × ' + L, span: T('shLg') + ' ' + q.G, rate: '–', P: su * Math.PI * q.D * q.D / 4,
      rem: T('shParallel') + ' ' + q.A + ', R ' + q.R + ', ' + T('spBar') + ' Ø' + q.C + ' †', n0: 3 };
  }
  function metalRows(h, su, sh) {
    if (sh && sh.mform === 'round') return [roundRow(sh.mround, su)];
    return [{ key: 'e8', std: 'ASTM E8', shape: dog(200, 20, 12.5, 57, 12.5), view: 'plan', gauge: 50, size: '12.5 (20) × 200 × ' + f(h, 2), span: T('shLg') + ' 50', rate: '–', P: su * 12.5 * h, rem: T('shParallel') + ' 57, R 12.5' }];
  }

  // ---------- 재단 배치 ----------
  function layout(rows, opt) {
    var Lmax = 0, blocks = [], shelves = [], y = 0, rects = [], gap = opt.kerf;
    rows.forEach(function (r) { if (r.n > 0) { Lmax = Math.max(Lmax, r.shape.len); blocks.push({ r: r, len: r.shape.len, w: r.shape.w, n: r.n }); } });
    var plen = opt.plen > 0 ? opt.plen - 2 * opt.margin : Lmax, short = plen < Lmax - 1e-9;
    if (short) plen = Lmax;
    blocks.sort(function (a, b) { return b.len - a.len; });
    // 긴 시편부터 줄에 채움. 한 줄 안에서는 같은 시험끼리 세로로 쌓음
    blocks.forEach(function (b) {
      var left = b.n;
      while (left > 0) {
        var s = null, i;
        for (i = 0; i < shelves.length; i++) if (shelves[i].used + gap + b.len <= plen + 1e-9) { s = shelves[i]; break; }
        if (!s) { s = { used: -gap, h: 0, items: [] }; shelves.push(s); }
        var cap = s.h > 0 ? Math.max(1, Math.floor((s.h + gap) / (b.w + gap))) : left, take = Math.min(left, cap);
        s.items.push({ b: b, x: s.used + gap, n: take }); s.used += gap + b.len; s.h = Math.max(s.h, take * b.w + (take - 1) * gap); left -= take;
      }
    });
    shelves.forEach(function (s) { s.items.forEach(function (it) { for (var i = 0; i < it.n; i++) rects.push({ key: it.b.r.key, shape: it.b.r.shape, x: it.x + opt.margin, y: y + i * (it.b.w + gap) + opt.margin }); }); y += s.h + gap; });
    return { L: plen + 2 * opt.margin, W: Math.max(0, y - gap) + 2 * opt.margin, rects: rects, short: short };
  }
  // ---------- 도면 자료 (mm, Y 위쪽이 +). 항목: L 선, A 호(반시계, 도), C 원, T 문자 ----------
  function prims(sp, x, y, layer) {
    var L = sp.len, W = sp.w, o = [], ln = function (a, b, c, d) { o.push({ t: 'L', l: layer, x1: x + a, y1: y + b, x2: x + c, y2: y + d }); }, i; // eslint-disable-line
    var poly = function (pts) { for (i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; ln(pts[i][0], pts[i][1], q[0], q[1]); } }; // eslint-disable-line
    if (sp.type === 'dog') {
      var Wn = sp.W, R = sp.R, d = (W - Wn) / 2, ax = Math.sqrt(Math.max(0, R * R - (R - d) * (R - d))), xg = Math.max(0, (L - sp.A) / 2 - ax);
      var th = Math.atan2(R - d, -ax) * 180 / Math.PI, th2 = Math.atan2(R - d, ax) * 180 / Math.PI, arc = function (cx, cy, a0, a1) { o.push({ t: 'A', l: layer, cx: x + cx, cy: y + cy, r: R, a0: a0, a1: a1 }); }; // eslint-disable-line
      ln(0, 0, xg, 0); arc(xg + ax, d - R, 90, th); ln(xg + ax, d, L - xg - ax, d); arc(L - xg - ax, d - R, th2, 90); ln(L - xg, 0, L, 0); ln(L, 0, L, W);
      ln(L, W, L - xg, W); arc(L - xg - ax, W - d + R, 270, 360 - th2); ln(L - xg - ax, W - d, xg + ax, W - d); arc(xg + ax, W - d + R, 360 - th, 270); ln(xg, W, 0, W); ln(0, W, 0, 0);
    } else if (sp.type === 'vn') {
      var c = L / 2, dd = sp.d; poly([[0, 0], [c - dd, 0], [c, dd], [c + dd, 0], [L, 0], [L, W], [c + dd, W], [c, W - dd], [c - dd, W], [0, W]]);
    } else if (sp.type === 'izod') {
      var c2 = L / 2, hw = sp.d * Math.tan(sp.ha || Math.PI / 8); poly([[0, 0], [L, 0], [L, W], [c2 + hw, W], [c2, W - sp.d], [c2 - hw, W], [0, W]]);
    } else if (sp.type === 'circ') o.push({ t: 'C', l: layer, cx: x + L / 2, cy: y + W / 2, r: L / 2 });
    else poly([[0, 0], [L, 0], [L, W], [0, W]]);
    return o;
  }
  var CODE = { tension: 'D3039', comp: 'COMP', flex: 'D790', ilss: 'D2344', vnotch: 'D5379', fiber: 'D3171', ptension: 'D638', pcomp: 'D695', pflex: 'D790', izod: 'D256', e8: 'E8' };
  function code(r) { return r.code || CODE[r.key] || r.key.toUpperCase(); }
  // 재단용: 판 외곽 + 시편 외곽 (+ 이름표)
  function cutDoc(lay, labels) {
    var Lp = Math.ceil(lay.L), Wp = Math.ceil(lay.W), it = prims({ type: 'rect', len: Lp, w: Wp }, 0, 0, 'PANEL'), cnt = {};
    lay.rects.forEach(function (r) {
      var y = Wp - (r.y + r.shape.w); it = it.concat(prims(r.shape, r.x, y, 'OUTLINE'));
      cnt[r.key] = (cnt[r.key] || 0) + 1;
      if (labels) it.push({ t: 'T', l: 'TEXT', x: r.x + r.shape.len / 2, y: y + r.shape.w / 2 - 1.2, h: 2.5, s: (r.code || CODE[r.key] || r.key) + '-' + cnt[r.key], mid: true });
    });
    return { items: it, W: Lp, H: Wp };
  }
  // 도면용: 시편 종류마다 1개씩, 치수선과 문자
  function drawDoc(rows, h) {
    var it = [], y = 0, Wm = 0, dim = function (x1, x2, yy, s) { // eslint-disable-line
      it.push({ t: 'L', l: 'DIM', x1: x1, y1: yy, x2: x2, y2: yy }, { t: 'L', l: 'DIM', x1: x1, y1: yy - 1.5, x2: x1, y2: yy + 1.5 }, { t: 'L', l: 'DIM', x1: x2, y1: yy - 1.5, x2: x2, y2: yy + 1.5 }, { t: 'T', l: 'DIM', x: (x1 + x2) / 2, y: yy + 1, h: 2.5, s: s, mid: true });
    };
    rows.slice().reverse().forEach(function (r) {
      var sp = r.shape, L = sp.len, W = sp.w, n2 = function (v) { return String(+(+v).toFixed(2)); }; // eslint-disable-line
      dim(0, L, y, 'L ' + n2(L)); y += 8;
      it = it.concat(prims(sp, 0, y, 'OUTLINE'));
      it.push({ t: 'L', l: 'DIM', x1: L + 6, y1: y, x2: L + 6, y2: y + W }, { t: 'L', l: 'DIM', x1: L + 4.5, y1: y, x2: L + 7.5, y2: y }, { t: 'L', l: 'DIM', x1: L + 4.5, y1: y + W, x2: L + 7.5, y2: y + W }, { t: 'T', l: 'DIM', x: L + 9, y: y + W / 2 - 1.2, h: 2.5, s: 'W ' + n2(W) + (sp.type === 'dog' ? ' / ' + n2(sp.W) : '') });
      if (r.gauge) dim(L / 2 - r.gauge / 2, L / 2 + r.gauge / 2, y + W + 5, 'GL ' + n2(r.gauge));
      if (r.sup) dim(L / 2 - r.sup / 2, L / 2 + r.sup / 2, y + W + 5, 'SPAN ' + n2(r.sup));
      var extra = sp.type === 'dog' ? ' R ' + n2(sp.R) + ' A ' + n2(sp.A) : sp.type === 'vn' ? ' NOTCH 90DEG D ' + n2(sp.d) : sp.type === 'izod' ? ' NOTCH 45DEG D ' + n2(sp.d) : sp.type === 'circ' ? ' DIA ' + n2(L) : '';
      it.push({ t: 'T', l: 'TEXT', x: 0, y: y + W + (r.gauge || r.sup ? 12 : 5), h: 3.5, s: r.std + ' ' + code(r) + '  T ' + n2(h) + '  QTY ' + r.n + extra });
      Wm = Math.max(Wm, L + 60); y += W + (r.gauge || r.sup ? 12 : 5) + 14;
    });
    it.forEach(function (q) { ['y', 'y1', 'y2', 'cy'].forEach(function (k) { if (q[k] !== undefined) q[k] += 6; }); ['x', 'x1', 'x2', 'cx'].forEach(function (k) { if (q[k] !== undefined) q[k] += 6; }); });
    return { items: it, W: Math.ceil(Wm + 12), H: Math.ceil(y + 8) };
  }
  // 재단용 SVG: 판 크기 = 쪽 크기(mm), 시편마다 닫힌 경로 1개. 시편 CAM의 SVG 입력 형식에 맞춤
  function xesc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function cutSvg(lay, title) {
    var L = Math.ceil(lay.L), W = Math.ceil(lay.W), cnt = {}, s = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + L + 'mm" height="' + W + 'mm" viewBox="0 0 ' + L + ' ' + W + '">\n<title>' + xesc(title) + '</title>\n<g id="specimens" fill="none" stroke="#008000" stroke-width="0.2">\n';
    lay.rects.forEach(function (r) {
      cnt[r.key] = (cnt[r.key] || 0) + 1; var id = (r.code || CODE[r.key] || r.key) + '-' + cnt[r.key];
      s += r.shape.type === 'circ' ? '<circle id="' + id + '" cx="' + (r.x + r.shape.len / 2).toFixed(3) + '" cy="' + (r.y + r.shape.w / 2).toFixed(3) + '" r="' + (r.shape.len / 2).toFixed(3) + '"/>\n' : '<path id="' + id + '" d="' + outline(r.shape, r.x, r.y, 1) + '"/>\n';
    });
    return s + '</g>\n</svg>\n';
  }
  var LAY = { PANEL: 7, OUTLINE: 3, DIM: 2, TEXT: 7 };
  function toDxf(doc) {
    var o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB', '0', 'TABLE', '2', 'LAYER', '70', '4'], k, n = function (v) { return (+v).toFixed(4); }; // eslint-disable-line
    for (k in LAY) o.push('0', 'LAYER', '2', k, '70', '0', '62', String(LAY[k]), '6', 'CONTINUOUS');
    o.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
    doc.items.forEach(function (q) {
      if (q.t === 'L') o.push('0', 'LINE', '8', q.l, '10', n(q.x1), '20', n(q.y1), '30', '0.0', '11', n(q.x2), '21', n(q.y2), '31', '0.0');
      else if (q.t === 'A') o.push('0', 'ARC', '8', q.l, '10', n(q.cx), '20', n(q.cy), '30', '0.0', '40', n(q.r), '50', n(q.a0), '51', n(q.a1));
      else if (q.t === 'C') o.push('0', 'CIRCLE', '8', q.l, '10', n(q.cx), '20', n(q.cy), '30', '0.0', '40', n(q.r));
      else if (q.mid) o.push('0', 'TEXT', '8', q.l, '10', n(q.x), '20', n(q.y), '30', '0.0', '40', n(q.h), '1', q.s, '72', '1', '11', n(q.x), '21', n(q.y), '31', '0.0');
      else o.push('0', 'TEXT', '8', q.l, '10', n(q.x), '20', n(q.y), '30', '0.0', '40', n(q.h), '1', q.s);
    });
    o.push('0', 'ENDSEC', '0', 'EOF');
    return o.join('\r\n') + '\r\n';
  }
  function toSvg(doc, title) {
    var H = doc.H, r = function (v) { return +(+v).toFixed(3); }, col = { PANEL: '#000000', OUTLINE: '#008000', DIM: '#b08000', TEXT: '#000000' }, g = { PANEL: '', OUTLINE: '', DIM: '', TEXT: '' }; // eslint-disable-line
    doc.items.forEach(function (q) {
      if (q.t === 'L') g[q.l] += '<path d="M' + r(q.x1) + ' ' + r(H - q.y1) + 'L' + r(q.x2) + ' ' + r(H - q.y2) + '"/>\n';
      else if (q.t === 'A') {
        var a0 = q.a0 * Math.PI / 180, a1 = q.a1 * Math.PI / 180, sw = ((q.a1 - q.a0) % 360 + 360) % 360;
        g[q.l] += '<path d="M' + r(q.cx + q.r * Math.cos(a0)) + ' ' + r(H - q.cy - q.r * Math.sin(a0)) + 'A' + r(q.r) + ' ' + r(q.r) + ' 0 ' + (sw > 180 ? 1 : 0) + ' 0 ' + r(q.cx + q.r * Math.cos(a1)) + ' ' + r(H - q.cy - q.r * Math.sin(a1)) + '"/>\n';
      } else if (q.t === 'C') g[q.l] += '<circle cx="' + r(q.cx) + '" cy="' + r(H - q.cy) + '" r="' + r(q.r) + '"/>\n';
      else g.TEXT += '<text x="' + r(q.x) + '" y="' + r(H - q.y) + '" font-size="' + q.h + '"' + (q.mid ? ' text-anchor="middle"' : '') + '>' + xesc(q.s) + '</text>\n';
    });
    var s = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + doc.W + 'mm" height="' + doc.H + 'mm" viewBox="0 0 ' + doc.W + ' ' + doc.H + '">\n<title>' + xesc(title) + '</title>\n';
    ['PANEL', 'OUTLINE', 'DIM'].forEach(function (k) { if (g[k]) s += '<g id="' + k.toLowerCase() + '" fill="none" stroke="' + col[k] + '" stroke-width="0.2">\n' + g[k] + '</g>\n'; });
    if (g.TEXT) s += '<g id="text" font-family="sans-serif" fill="#000000">\n' + g.TEXT + '</g>\n';
    return s + '</svg>\n';
  }

  return { ROUND: ROUND, RUB: RUB, RKEYS: RKEYS, gent: gent, yeoh: yeoh, rubS: rubS, rubDims: rubDims, rubRows: rubRows, PLAS: PLAS, PKEYS: PKEYS, D638: D638, outline: outline, lamDims: lamDims, lamRows: lamRows, plasDims: plasDims, plasRows: plasRows, metalRows: metalRows, layout: layout, prims: prims, cutDoc: cutDoc, drawDoc: drawDoc, toDxf: toDxf, toSvg: toSvg, cutSvg: cutSvg };
})();

/* views.js: 3D 창 4개의 장면 구성 */
var Scenes = (function () {
  'use strict';
  var C = BeamCalc, G = GL3, T = U.T;
  var SER = { V: [0.30, 0.78, 0.96], M: [1.0, 0.62, 0.26], th: [0.66, 0.86, 0.36], w: [0.97, 0.52, 0.72] };
  var SURF_RNG = { L0: 200, L1: 3000, h0: 10, h1: 300 };

  function sampleAt(p, res, x) {
    var B = res.B, hx = p.h * (1 - (1 - p.taper) * x / p.L);
    return {
      x: x, h: hx, sp: C.sectionProps(p.kind, hx, p.b, res.tE, p.mat.nu),
      M: C.interp(B.x, res.M, x), V: C.interp(B.x, res.V, x), w: C.interp(B.x, res.w, x), th: C.interp(B.x, res.th, x)
    };
  }

  function fieldAt(p, res, s, y, key) {
    var sax = -(p.Pax || 0) / s.sp.A, sig = sax + s.M * y / s.sp.I;
    if (key === 'sigma') return sig;
    var tau = Math.abs(s.V) * C.shearQb(p.kind, s.h, p.b, res.tE, y) / s.sp.I;
    if (key === 'tau') return tau;
    var vm = Math.sqrt(sig * sig + 3 * tau * tau);
    if (key === 'vm') return vm;
    var cr = p.mat.crit;
    if (cr.type === 'vm') return vm / cr.sy;
    return Math.max(sig > 0 ? sig / cr.xt : -sig / cr.xc, tau / cr.s);
  }

  function fieldRange(res, key) {
    var m = 0, i;
    if (key === 'sigma') { for (i = 0; i < res.sTop.length; i++) m = Math.max(m, Math.abs(res.sTop[i]), Math.abs(res.sBot[i])); return [-(m || 1), m || 1]; }
    if (key === 'tau') return [0, res.tauMax || 1];
    if (key === 'vm') return [0, res.vmMax || 1];
    return [0, 1];
  }
  function colOf(v, rg) { return G.rainbow((v - rg[0]) / (rg[1] - rg[0])); }

  // 단면 외곽: 띠 목록. 띠 = 점 {y, z, ny, nz} 배열
  function strips(kind, h, b, t) {
    var H = h / 2, Z = b / 2, out = [], i;
    function flat(y0, z0, y1, z1, ny, nz, sub) {
      var s = [];
      for (i = 0; i <= sub; i++) { var f = i / sub; s.push({ y: y0 + (y1 - y0) * f, z: z0 + (z1 - z0) * f, ny: ny, nz: nz }); }
      out.push(s);
    }
    function ring(r, sg) {
      var s = [];
      for (i = 0; i <= 40; i++) { var a = 2 * Math.PI * i / 40; s.push({ y: r * Math.cos(a), z: r * Math.sin(a), ny: sg * Math.cos(a), nz: sg * Math.sin(a) }); }
      out.push(s);
    }
    if (kind === 'tube') { ring(H, 1); ring(H - t, -1); return out; }
    if (kind === 'rect' || kind === 'box') {
      flat(H, -Z, H, Z, 1, 0, 1); flat(-H, -Z, -H, Z, -1, 0, 1); flat(-H, Z, H, Z, 0, 1, 10); flat(-H, -Z, H, -Z, 0, -1, 10);
      if (kind === 'box') {
        flat(H - t, -Z + t, H - t, Z - t, -1, 0, 1); flat(-H + t, -Z + t, -H + t, Z - t, 1, 0, 1);
        flat(-H + t, Z - t, H - t, Z - t, 0, -1, 8); flat(-H + t, -Z + t, H - t, -Z + t, 0, 1, 8);
      }
      return out;
    }
    var w = t / 2;
    flat(H, -Z, H, Z, 1, 0, 1); flat(H - t, Z, H, Z, 0, 1, 1); flat(H - t, -Z, H, -Z, 0, -1, 1);
    flat(H - t, w, H - t, Z, -1, 0, 1); flat(H - t, -Z, H - t, -w, -1, 0, 1);
    flat(-H + t, w, H - t, w, 0, 1, 8); flat(-H + t, -w, H - t, -w, 0, -1, 8);
    flat(-H + t, w, -H + t, Z, 1, 0, 1); flat(-H + t, -Z, -H + t, -w, 1, 0, 1);
    flat(-H, Z, -H + t, Z, 0, 1, 1); flat(-H, -Z, -H + t, -Z, 0, -1, 1); flat(-H, -Z, -H, Z, -1, 0, 1);
    return out;
  }
  // 단면 면: 사각형 목록 [y0, y1, z0, z1]
  function capRects(kind, h, b, t) {
    var H = h / 2, Z = b / 2;
    if (kind === 'rect') return [[-H, H, -Z, Z]];
    if (kind === 'box') return [[H - t, H, -Z, Z], [-H, -H + t, -Z, Z], [-H + t, H - t, Z - t, Z], [-H + t, H - t, -Z, -Z + t]];
    return [[H - t, H, -Z, Z], [-H, -H + t, -Z, Z], [-H + t, H - t, -t / 2, t / 2]];
  }
  function widthZ(p) { return p.kind === 'tube' ? p.h : p.b; }

  function niceEx(v) {
    if (!(v > 1)) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v))), f = v / e;
    return (f >= 5 ? 5 : (f >= 2 ? 2 : 1)) * e;
  }
  function autoExag(p, res) {
    var d = Math.abs(res.tip);
    if (!(d > 0) || !res.stable) return 1;
    return Math.min(2000, niceEx(0.13 * p.L / d));
  }

  // ---------------- 창 1: 응력 ----------------
  function buildStress(view, cx) {
    var p = cx.p, res = cx.res, th = cx.theme, L = p.L, sc = 2 / L, ex = cx.exag, dd = cx.animD;
    var op = view.op, al = view.al, ln = view.ln, lb = [];
    op.clear(); al.clear(); ln.clear();
    var nx = 72, st = [], i, k, key = cx.colorBy, rg = fieldRange(res, key);
    for (i = 0; i <= nx; i++) {
      var s = sampleAt(p, res, L * i / nx);
      s.ph = Math.atan(s.th * ex * dd); s.sn = Math.sin(s.ph); s.cs = Math.cos(s.ph); s.wd = s.w * ex * dd;
      s.st = strips(p.kind, s.h, p.b, res.tE);
      st.push(s);
    }
    function P(s, y, z) { return [(s.x + y * s.sn - L / 2) * sc, (-s.wd + y * s.cs) * sc, z * sc]; }
    function N(s, ny, nz) { return [ny * s.sn, ny * s.cs, nz]; }
    function stAt(x) {
      var s = sampleAt(p, res, x);
      s.ph = Math.atan(s.th * ex * dd); s.sn = Math.sin(s.ph); s.cs = Math.cos(s.ph); s.wd = s.w * ex * dd;
      return s;
    }
    // 보 몸통
    for (i = 0; i < nx; i++) {
      var a = st[i], b = st[i + 1];
      for (k = 0; k < a.st.length; k++) {
        var sa = a.st[k], sb = b.st[k];
        for (var j = 0; j < sa.length - 1; j++) {
          var a0 = sa[j], a1 = sa[j + 1], b0 = sb[j], b1 = sb[j + 1];
          op.quad(P(a, a0.y, a0.z), P(b, b0.y, b0.z), P(b, b1.y, b1.z), P(a, a1.y, a1.z),
            [N(a, a0.ny, a0.nz), N(b, b0.ny, b0.nz), N(b, b1.ny, b1.nz), N(a, a1.ny, a1.nz)],
            colOf(fieldAt(p, res, a, a0.y, key), rg), colOf(fieldAt(p, res, b, b0.y, key), rg),
            colOf(fieldAt(p, res, b, b1.y, key), rg), colOf(fieldAt(p, res, a, a1.y, key), rg));
        }
      }
    }
    // 끝단 면
    var e = st[nx], nE = [e.cs, -e.sn, 0];
    if (p.kind === 'tube') {
      var so = e.st[0], si = e.st[1];
      for (k = 0; k < so.length - 1; k++) {
        op.quad(P(e, so[k].y, so[k].z), P(e, so[k + 1].y, so[k + 1].z), P(e, si[k + 1].y, si[k + 1].z), P(e, si[k].y, si[k].z), nE,
          colOf(fieldAt(p, res, e, so[k].y, key), rg), colOf(fieldAt(p, res, e, so[k + 1].y, key), rg),
          colOf(fieldAt(p, res, e, si[k + 1].y, key), rg), colOf(fieldAt(p, res, e, si[k].y, key), rg));
      }
    } else {
      capRects(p.kind, e.h, p.b, res.tE).forEach(function (r) {
        var c0 = colOf(fieldAt(p, res, e, r[0], key), rg), c1 = colOf(fieldAt(p, res, e, r[1], key), rg);
        op.quad(P(e, r[0], r[2]), P(e, r[0], r[3]), P(e, r[1], r[3]), P(e, r[1], r[2]), nE, c0, c0, c1, c1);
      });
    }
    // 고정벽, 바닥 격자
    var bz = widthZ(p), wh = (0.5 * Math.max(p.h, bz) + 0.07 * L) * sc, wt = 0.07 * L * sc;
    op.box([-1 - wt, -wh, -wh], [-1, wh, wh], th.wall);
    var fy = -wh, gx;
    for (gx = -1.2; gx <= 1.2001; gx += 0.2) ln.line([gx, fy, -0.5], [gx, fy, 0.5], th.grid);
    for (gx = -0.5; gx <= 0.5001; gx += 0.25) ln.line([-1.2, fy, gx], [1.2, fy, gx], th.grid);
    // 변형 전 외곽선
    var prev = null;
    for (i = 0; i <= nx; i += 6) {
      var s0 = st[i], hh = s0.h / 2 * sc, zz = bz / 2 * sc, xx = (s0.x - L / 2) * sc;
      var cur = [[xx, hh, zz], [xx, hh, -zz], [xx, -hh, -zz], [xx, -hh, zz]];
      if (prev) for (k = 0; k < 4; k++) ln.line(prev[k], cur[k], th.dim);
      prev = cur;
    }
    for (k = 0; k < 4; k++) ln.line(prev[k], prev[(k + 1) % 4], th.dim);
    // 하중 화살표
    var qmax = 0, top = function (s) { return P(s, s.h / 2, 0); };
    for (i = 0; i < res.q.length; i++) qmax = Math.max(qmax, res.q[i]);
    var lenMax = 0.4, tails = [];
    if (p.loadCase === 'point') {
      var sp = stAt(p.a * L), tp = top(sp);
      if (p.W > 0) {
        op.arrow([tp[0], tp[1] + lenMax, tp[2]], tp, 0.013, th.ink);
        lb.push({ p: [tp[0], tp[1] + lenMax, tp[2]], text: 'W = ' + U.fix(p.W, 0) + ' N', cls: 'strong', ay: -1, dy: -4 });
      }
    } else if (qmax > 0) {
      var na = 13;
      for (k = 0; k < na; k++) {
        var xk = L * (k + 0.5) / na, sk = stAt(xk), qk = C.interp(res.B.x, res.q, xk) / qmax, tk = top(sk);
        var tail = [tk[0], tk[1] + Math.max(0.02, lenMax * qk), tk[2]];
        tails.push(tail);
        if (qk > 0.06) op.arrow(tail, tk, 0.007, th.ink);
      }
      op.tube(tails, 0.004, th.ink, 4, false);
      var mid = tails[Math.floor(na / 2)];
      lb.push({ p: [mid[0], Math.max(tails[0][1], tails[na - 1][1], mid[1]), mid[2]], text: 'W = ' + U.fix(p.W, 0) + ' N', cls: 'strong', ay: -1, dy: -6 });
    }
    // 축력 화살표
    var tipC = P(e, 0, 0);
    if (p.Pax) {
      var ax = [e.cs, -e.sn, 0], far = G.add(tipC, G.mulS(ax, 0.34));
      if (p.Pax > 0) op.arrow(far, G.add(tipC, G.mulS(ax, 0.02)), 0.011, th.ink); else op.arrow(G.add(tipC, G.mulS(ax, 0.02)), far, 0.011, th.ink);
      lb.push({ p: far, text: 'P = ' + U.fix(Math.abs(p.Pax) / 1000, 1) + ' kN ' + (p.Pax > 0 ? T('lComp') : T('lTens')), ay: 1, dy: 10 });
    }
    // 최대 응력 표시
    if (res.peak > 0 && res.stable) {
      var spk = stAt(res.peakX), topSide = Math.abs(C.interp(res.B.x, res.sTop, res.peakX)) >= Math.abs(C.interp(res.B.x, res.sBot, res.peakX));
      var pp = P(spk, (topSide ? 1 : -1) * spk.h / 2, 0);
      op.sphere(pp, 0.022, [1, 1, 1]);
      lb.push({ p: pp, text: T('lPeak') + ' ' + U.fix(res.peak, 1) + ' MPa', cls: 'strong', ax: 1, ay: topSide ? -1 : 1, dx: 8, dy: topSide ? -6 : 6 });
    }
    // 끝단 처짐
    var tip0 = [1, 0, 0];
    ln.line(tip0, tipC, th.ink);
    lb.push({ p: [tipC[0], (tipC[1] + tip0[1]) / 2, 0], text: res.stable ? 'δ = ' + U.mm(res.tip * dd) + ' mm' : T('unstableShort'), cls: 'strong', ax: 1, dx: 10 });
    lb.push({ p: [-1 - wt, -wh, wh], text: T('lFixed'), cls: 'dim', ax: -1, ay: 1, dx: -2, dy: 4 });
    lb.push({ p: [1, fy, 0.5], text: 'x = ' + U.fix(L, 0) + ' mm', cls: 'dim', ay: 1, dy: 4 });
    lb.push({ p: [-1, fy, 0.5], text: 'x = 0', cls: 'dim', ay: 1, dy: 4 });
    // 단면 위치 커서
    var sx = stAt(cx.xSec), ch = (sx.h / 2 * 1.35 + 0.02 * L), cz = (bz / 2 * 1.5 + 0.02 * L);
    var q0 = P(sx, -ch, -cz), q1 = P(sx, -ch, cz), q2 = P(sx, ch, cz), q3 = P(sx, ch, -cz);
    al.group(P(sx, 0, 0)); al.quad(q0, q1, q2, q3, [0, 0, 0], th.accent, th.accent, th.accent, th.accent, 0.2); al.endGroup();
    ln.line(q0, q1, th.accent); ln.line(q1, q2, th.accent); ln.line(q2, q3, th.accent); ln.line(q3, q0, th.accent);
    view.labels = lb; view.dirty = true;
    return { range: rg, key: key };
  }

  // ---------------- 창 2: 선도 ----------------
  function buildDiagrams(view, cx) {
    var p = cx.p, res = cx.res, th = cx.theme, L = p.L, B = res.B;
    var op = view.op, al = view.al, ln = view.ln, lb = [];
    op.clear(); al.clear(); ln.clear();
    // 뒤에서 앞으로, 위에서 아래로 계단처럼 놓음
    var defs = [
      { k: 'V', arr: res.V, z: -0.48, y: 0.56, sg: 1, name: T('dV'), f: 1, unit: 'N', d: 0 },
      { k: 'M', arr: res.M, z: -0.16, y: 0.2, sg: 1, name: T('dM'), f: 0.001, unit: 'N·m', d: 1 },
      { k: 'th', arr: res.th, z: 0.16, y: -0.1, sg: -1, name: T('dTh'), f: 180 / Math.PI, unit: '°', d: 3 },
      { k: 'w', arr: res.w, z: 0.48, y: -0.4, sg: -1, name: T('dW'), f: 1, unit: 'mm', d: 2 }
    ];
    var nx = 96, i, xs = [], HS = 0.26;
    for (i = 0; i <= nx; i++) xs.push(L * i / nx);
    var xc = -1 + 2 * cx.xSec / L, vals = [], cur = [];
    defs.forEach(function (d) {
      var mx = 0, mi = 0, ys = [];
      for (i = 0; i <= nx; i++) { var v = C.interp(B.x, d.arr, xs[i]); ys.push(v); if (Math.abs(v) > mx) { mx = Math.abs(v); mi = i; } }
      var hs = mx > 0 ? HS / mx : 0, col = SER[d.k], pts = [];
      al.group([0, d.y + d.sg * HS / 2, d.z]);
      for (i = 0; i <= nx; i++) {
        var X = -1 + 2 * i / nx, Y = d.y + d.sg * ys[i] * hs;
        pts.push([X, Y, d.z]);
        if (i > 0) al.quad([pts[i - 1][0], d.y, d.z], [X, d.y, d.z], [X, Y, d.z], pts[i - 1], [0, 0, 0], col, col, col, col, 0.4);
      }
      al.endGroup();
      op.tube(pts, 0.009, col, 5, false);
      ln.line([-1, d.y, d.z], [1, d.y, d.z], th.dim);
      ln.line([-1, d.y - 0.03, d.z], [-1, d.y + 0.03, d.z], th.dim);
      for (i = 1; i <= 4; i++) ln.line([-1 + i * 0.5, d.y, d.z], [-1 + i * 0.5, d.y - d.sg * 0.025, d.z], th.dim);
      lb.push({ p: [-1, d.y, d.z], text: d.name, cls: 'ser-' + d.k, ax: -1, dx: -10 });
      if (mx > 0) lb.push({ p: pts[mi], text: U.fix(mx * d.f, d.d) + ' ' + d.unit, cls: 'dim', ax: 1, dx: mi > nx / 2 ? 8 : 6, ay: mi > nx / 2 ? 0 : (d.sg > 0 ? -1 : 1), dy: mi > nx / 2 ? 0 : (d.sg > 0 ? -5 : 5) });
      var vc = C.interp(B.x, d.arr, cx.xSec), yc = d.y + d.sg * vc * hs;
      op.sphere([xc, yc, d.z], 0.024, col);
      ln.line([xc, d.y - d.sg * 0.04, d.z], [xc, d.y + d.sg * (HS + 0.03), d.z], th.accent);
      cur.push([xc, d.y, d.z]);
      vals.push({ k: d.k, name: d.name, text: U.fix(vc * d.f, d.d) + ' ' + d.unit });
    });
    for (i = 0; i < cur.length - 1; i++) ln.line(cur[i], cur[i + 1], th.accent);
    var last = defs[3];
    var ty = last.y - HS - 0.07;
    ln.line([-1, ty + 0.03, last.z], [1, ty + 0.03, last.z], th.grid);
    lb.push({ p: [-1, ty, last.z], text: '0', cls: 'dim', ay: 1 });
    lb.push({ p: [0, ty, last.z], text: U.fix(L / 2, 0), cls: 'dim', ay: 1 });
    lb.push({ p: [1, ty, last.z], text: 'x = ' + U.fix(L, 0) + ' mm', cls: 'dim', ay: 1 });
    view.labels = lb; view.dirty = true;
    return { vals: vals };
  }

  // ---------------- 창 3: 단면 ----------------
  function buildSection(view, cx) {
    var p = cx.p, res = cx.res, th = cx.theme, mode = cx.secMode;
    var op = view.op, al = view.al, ln = view.ln, lb = [];
    op.clear(); al.clear(); ln.clear();
    var s = sampleAt(p, res, cx.xSec), t = res.tE, H = s.h / 2, bz = widthZ(p), Z = bz / 2;
    var sc = 1.15 / Math.max(s.h, bz), key = mode === 'sigma' ? 'sigma' : (mode === 'tau' ? 'tau' : 'vm');
    var rg = fieldRange(res, key), xb = -0.07, i, k;
    function F(y, z, x) { return [x || 0, y * sc, z * sc]; }
    function col(y) { return colOf(fieldAt(p, res, s, y, key), rg); }
    // 앞면
    if (p.kind === 'tube') {
      var nr = 48, Ro = H, Ri = H - t;
      for (i = 0; i < nr; i++) {
        var a0 = 2 * Math.PI * i / nr, a1 = 2 * Math.PI * (i + 1) / nr;
        var y0 = Math.cos(a0), z0 = Math.sin(a0), y1 = Math.cos(a1), z1 = Math.sin(a1);
        op.quad(F(Ro * y0, Ro * z0), F(Ro * y1, Ro * z1), F(Ri * y1, Ri * z1), F(Ri * y0, Ri * z0), [1, 0, 0], col(Ro * y0), col(Ro * y1), col(Ri * y1), col(Ri * y0));
      }
    } else {
      capRects(p.kind, s.h, p.b, t).forEach(function (r) {
        var ny = Math.max(1, Math.round(14 * (r[1] - r[0]) / s.h));
        for (i = 0; i < ny; i++) {
          var ya = r[0] + (r[1] - r[0]) * i / ny, yb = r[0] + (r[1] - r[0]) * (i + 1) / ny;
          op.quad(F(ya, r[2]), F(ya, r[3]), F(yb, r[3]), F(yb, r[2]), [1, 0, 0], col(ya), col(ya), col(yb), col(yb));
        }
      });
    }
    // 뒤로 밀어낸 옆면
    strips(p.kind, s.h, p.b, t).forEach(function (stp) {
      for (i = 0; i < stp.length - 1; i++) {
        var a = stp[i], b = stp[i + 1];
        op.quad(F(a.y, a.z, 0), F(b.y, b.z, 0), F(b.y, b.z, xb), F(a.y, a.z, xb), [[0, a.ny, a.nz], [0, b.ny, b.nz], [0, b.ny, b.nz], [0, a.ny, a.nz]], th.wall);
      }
    });
    // 화살표 위치
    var pts = [], rows = 9;
    if (p.kind === 'rect') {
      for (i = 0; i < rows; i++) for (k = -1; k <= 1; k++) pts.push([H * (-1 + 2 * (i + 0.5) / rows), k * 0.3 * bz]);
    } else if (p.kind === 'tube') {
      for (i = 0; i < 20; i++) { var an = 2 * Math.PI * (i + 0.5) / 20, rm = H - t / 2; pts.push([rm * Math.cos(an), rm * Math.sin(an)]); }
    } else {
      var yw = H - t, nw = 7;
      if (mode === 'sigma') for (k = -1; k <= 1; k++) { pts.push([H - t / 2, k * 0.33 * bz]); pts.push([-H + t / 2, k * 0.33 * bz]); }
      for (i = 0; i < nw; i++) {
        var yy = yw * (-1 + 2 * (i + 0.5) / nw);
        if (p.kind === 'box') { pts.push([yy, Z - t / 2]); pts.push([yy, -Z + t / 2]); } else pts.push([yy, 0]);
      }
    }
    var sMax = Math.max(Math.abs(rg[0]), Math.abs(rg[1]));
    if (mode === 'sigma') {
      pts.forEach(function (q) {
        var v = fieldAt(p, res, s, q[0], 'sigma'), len = 0.62 * Math.abs(v) / sMax;
        if (len < 0.015) return;
        var base = F(q[0], q[1], 0.004), tipP = F(q[0], q[1], 0.004 + len);
        if (v > 0) op.arrow(base, tipP, 0.011, colOf(v, rg)); else op.arrow(tipP, base, 0.011, colOf(v, rg));
      });
    } else if (mode === 'tau') {
      pts.forEach(function (q) {
        var v = fieldAt(p, res, s, q[0], 'tau'), len = 0.3 * v / sMax;
        if (len < 0.012) return;
        var c0 = F(q[0], q[1], 0.03);
        op.arrow([c0[0], c0[1] + len / 2, c0[2]], [c0[0], c0[1] - len / 2, c0[2]], 0.011, colOf(v, rg));
      });
    }
    // 중립축
    var sax = -(p.Pax || 0) / s.sp.A, yna = Math.abs(s.M) > 1e-9 ? -sax * s.sp.I / s.M : 0;
    if (Math.abs(yna) < H) {
      ln.line(F(yna, -Z * 1.35, 0.006), F(yna, Z * 1.35, 0.006), th.ink);
      lb.push({ p: F(yna, -Z * 1.35, 0.006), text: T('lNA'), cls: 'dim', ax: 1, dx: 6 });
    }
    var sT = fieldAt(p, res, s, H, 'sigma'), sB = fieldAt(p, res, s, -H, 'sigma');
    if (mode === 'tau') {
      var tm = fieldAt(p, res, s, 0, 'tau');
      lb.push({ p: F(0, Z, 0.03), text: 'τ = ' + U.fix(tm, 2) + ' MPa', cls: 'strong', ax: -1, dx: -10 });
    } else {
      lb.push({ p: F(H, 0, mode === 'sigma' ? 0.004 + 0.62 * Math.abs(sT) / sMax : 0), text: T('lTop') + ' σ = ' + U.fix(sT, 1) + ' MPa', cls: 'strong', ay: -1, dy: -8 });
      lb.push({ p: F(-H, 0, mode === 'sigma' ? 0.004 + 0.62 * Math.abs(sB) / sMax : 0), text: T('lBot') + ' σ = ' + U.fix(sB, 1) + ' MPa', cls: 'strong', ay: 1, dy: 8 });
    }
    view.labels = lb; view.dirty = true;
    return { range: rg, key: key, h: s.h };
  }

  // ---------------- 창 4: 설계 곡면 ----------------
  function buildSurface(view, cx) {
    var p = cx.p, res = cx.res, th = cx.theme, sf = cx.surf, metric = cx.surfMetric, R = SURF_RNG;
    var op = view.op, al = view.al, ln = view.ln, lb = [];
    op.clear(); al.clear(); ln.clear();
    if (!sf) { view.labels = lb; view.dirty = true; return null; }
    var data = metric === 'defl' ? sf.defl : (metric === 'stress' ? sf.stress : sf.mass);
    var nL = sf.Ls.length, nH = sf.hs.length, i, j, vmin = Infinity, vmax = -Infinity, isLog = metric !== 'mass';
    var cur = metric === 'defl' ? res.tip : (metric === 'stress' ? res.peak : res.mass);
    for (j = 0; j < nH; j++) for (i = 0; i < nL; i++) { var v = data[j][i]; if (isFinite(v) && v > 0) { vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); } }
    if (!(vmax > 0)) { vmin = 1e-3; vmax = 1; }
    if (isLog) vmin = Math.max(vmin, vmax * 1e-7); else vmin = 0;
    var y0 = -0.45, yh = 1.0, zf = 0.8;
    function X(L) { return -1 + 2 * Math.log(L / R.L0) / Math.log(R.L1 / R.L0); }
    function Zc(h) { return zf - 2 * zf * Math.log(h / R.h0) / Math.log(R.h1 / R.h0); }
    function Y(v) {
      if (!(v > 0)) return y0;
      var f = isLog ? Math.log(Math.max(v, vmin) / vmin) / Math.log(vmax / vmin) : v / vmax;
      return y0 + yh * Math.min(1.15, Math.max(0, f));
    }
    var P = [], ok = [];
    for (j = 0; j < nH; j++) {
      P.push([]); ok.push([]);
      for (i = 0; i < nL; i++) { var vv = data[j][i]; ok[j].push(isFinite(vv)); P[j].push([X(sf.Ls[i]), Y(vv), Zc(sf.hs[j])]); }
    }
    function nrm(j, i) {
      var a = P[j][Math.min(nL - 1, i + 1)], b = P[j][Math.max(0, i - 1)], c = P[Math.min(nH - 1, j + 1)][i], d = P[Math.max(0, j - 1)][i];
      var n = G.norm(G.cross(G.sub(c, d), G.sub(a, b)));
      return n[1] < 0 ? G.mulS(n, -1) : n;
    }
    function uc(j, i) { var u = sf.util[j][i]; return G.rainbow(isFinite(u) ? Math.min(1, u) : 1); }
    for (j = 0; j < nH - 1; j++) for (i = 0; i < nL - 1; i++) {
      if (!(ok[j][i] && ok[j][i + 1] && ok[j + 1][i] && ok[j + 1][i + 1])) continue;
      op.quad(P[j][i], P[j][i + 1], P[j + 1][i + 1], P[j + 1][i], [nrm(j, i), nrm(j, i + 1), nrm(j + 1, i + 1), nrm(j + 1, i)], uc(j, i), uc(j, i + 1), uc(j + 1, i + 1), uc(j + 1, i));
    }
    var lc = th.mesh;
    for (j = 0; j < nH; j += 4) for (i = 0; i < nL - 1; i++) if (ok[j][i] && ok[j][i + 1]) ln.line(P[j][i], P[j][i + 1], lc);
    for (i = 0; i < nL; i += 4) for (j = 0; j < nH - 1; j++) if (ok[j][i] && ok[j + 1][i]) ln.line(P[j][i], P[j + 1][i], lc);
    // 한계면
    var limTxt = null;
    if (metric === 'defl') {
      al.group([0, y0 + yh / 2, 0]);
      for (i = 0; i < nL - 1; i++) {
        var ya = Y(sf.Ls[i] / p.limitN), yb = Y(sf.Ls[i + 1] / p.limitN), xa = X(sf.Ls[i]), xb2 = X(sf.Ls[i + 1]);
        al.quad([xa, ya, -zf], [xb2, yb, -zf], [xb2, yb, zf], [xa, ya, zf], [0, 0, 0], th.ink, th.ink, th.ink, th.ink, 0.14);
        ln.line([xa, ya, zf], [xb2, yb, zf], th.ink); ln.line([xa, ya, -zf], [xb2, yb, -zf], th.ink);
      }
      al.endGroup();
      limTxt = { p: [1, Y(R.L1 / p.limitN), -zf], text: T('lLimit') + ' L/' + p.limitN };
    } else if (metric === 'stress') {
      var cr = p.mat.crit, allow = cr.type === 'vm' ? cr.sy : Math.min(cr.xt, cr.xc);
      if (allow >= vmin && allow <= vmax * 1.5) {
        var yl = Y(allow);
        al.group([0, yl, 0]); al.quad([-1, yl, -zf], [1, yl, -zf], [1, yl, zf], [-1, yl, zf], [0, 0, 0], th.ink, th.ink, th.ink, th.ink, 0.14); al.endGroup();
        ln.line([-1, yl, zf], [1, yl, zf], th.ink); ln.line([-1, yl, -zf], [1, yl, -zf], th.ink); ln.line([-1, yl, -zf], [-1, yl, zf], th.ink); ln.line([1, yl, -zf], [1, yl, zf], th.ink);
        limTxt = { p: [-1, yl, -zf], text: T('lAllow') + ' ' + U.fix(allow, 0) + ' MPa', left: true };
      }
    }
    if (limTxt) lb.push({ p: limTxt.p, text: limTxt.text, cls: 'dim', ax: limTxt.left ? -1 : 1, dx: limTxt.left ? -6 : 6, ay: -1, dy: -3 });
    // 바닥 틀, 눈금
    ln.line([-1, y0, -zf], [1, y0, -zf], th.dim); ln.line([-1, y0, zf], [1, y0, zf], th.dim);
    ln.line([-1, y0, -zf], [-1, y0, zf], th.dim); ln.line([1, y0, -zf], [1, y0, zf], th.dim);
    ln.line([1, y0, -zf], [1, y0 + yh, -zf], th.dim);
    [200, 500, 1000, 2000, 3000].forEach(function (Lv) {
      ln.line([X(Lv), y0, zf], [X(Lv), y0, zf + 0.04], th.dim);
      lb.push({ p: [X(Lv), y0, zf + 0.04], text: U.fix(Lv, 0), cls: 'dim', ay: 1, dy: 3 });
    });
    [10, 30, 100, 300].forEach(function (hv) {
      ln.line([-1, y0, Zc(hv)], [-1.04, y0, Zc(hv)], th.dim);
      lb.push({ p: [-1.04, y0, Zc(hv)], text: U.fix(hv, 0), cls: 'dim', ax: -1, dx: -4 });
    });
    lb.push({ p: [X(700), y0, zf + 0.04], text: T('lAxisL'), cls: 'dim', ay: 1, dy: 30 });
    lb.push({ p: [-1.04, y0, 0], text: T('lAxisH'), cls: 'dim', ax: -1, dx: -34 });
    var unit = metric === 'defl' ? 'mm' : (metric === 'stress' ? 'MPa' : 'kg');
    lb.push({ p: [1, y0 + yh, -zf], text: U.sig(vmax, 3) + ' ' + unit, cls: 'dim', ax: 1, dx: 6 });
    // 현재 설계점
    var Lc = Math.min(R.L1, Math.max(R.L0, p.L)), hc = Math.min(R.h1, Math.max(R.h0, p.h));
    var mp = [X(Lc), Y(cur), Zc(hc)];
    op.sphere(mp, 0.036, [1, 1, 1]);
    ln.line(mp, [mp[0], y0, mp[2]], th.ink);
    lb.push({ p: mp, text: T('lNow') + ' ' + (metric === 'mass' ? U.fix(cur, 2) : U.sig(cur, 3)) + ' ' + unit, cls: 'strong', ay: -1, dy: -10 });
    view.labels = lb; view.dirty = true;
    return { vmin: vmin, vmax: vmax, isLog: isLog, unit: unit };
  }

  return { buildStress: buildStress, buildDiagrams: buildDiagrams, buildSection: buildSection, buildSurface: buildSurface,
    autoExag: autoExag, SURF_RNG: SURF_RNG, SER: SER, fieldRange: fieldRange };
})();

/* order.js: 예상 견적과 주문. 근거: BEAM_20, BEAM_22
   값 = 판 값 × 판 수 + Σ(가공 × 계수 × 수량) + 탭 × 탭 시편 수. 부가세 전, 원, 3T 기준.
   시편이 1개여도 판 1장은 만들어야 하므로 판 수는 최소 1입니다. 고칠 곳은 아래 PRICE 한 곳입니다. */
Object.assign(I18N, {
  odT: ['예상 견적과 주문', 'Estimate and order'], odSub: ['3T 시편 기준, 부가세 포함', 'based on 3 mm coupons, VAT included'],
  odSupply: ['소재', 'Material'], odSw: ['스타웍스가 공급 (판 제작 포함)', 'Supplied by STAR Works (panel included)'], odOwn: ['사급 (가공만)', 'Customer-supplied (machining only)'],
  odTab: ['탭', 'Tabs'], odTabY: ['적용', 'Bonded'], odTabN: ['미적용', 'None'],
  odItem: ['시편', 'Coupon'], odQty: ['수량', 'Qty'], odUnit: ['개당', 'Each'], odSubt: ['소계', 'Subtotal'], odSum: ['합계', 'Total'], odVat: ['부가세 10 %', 'VAT 10 %'], odTotal: ['예상 금액 (부가세 포함)', 'Estimated total (VAT included)'],
  odWon: ['원', 'KRW'], odTabIn: ['탭 포함', 'with tabs'], odPcsU: ['판', 'panel'],
  odPanelLam: ['판 맞춤 성형 (400 × 400 mm, 3T)', 'Custom panel moulding (400 × 400 mm, 3 mm)'], odPanelSheet: ['판재 제작 (400 × 400 mm 기준)', 'Sheet stock (400 × 400 mm basis)'],
  odOnePanel: ['시편이 1개여도 판 1장을 만들어야 해서 판 값은 판 단위로 들어갑니다. 판은 400 × 400 mm 기준이고 시편 간격은 4 mm로 셉니다.', 'Even one coupon needs a whole panel, so the panel is charged per panel. Panels are 400 × 400 mm and coupons are counted at a 4 mm spacing.'],
  odMachOnly: ['가공', 'machining'], odAsk: ['별도 견적', 'quoted separately'], odFrom: ['부터', 'and up'], odRush: ['사출 일정', 'Moulding schedule'], odRushN: ['모아서 진행 (일정 협의)', 'Batched run (date by arrangement)'], odRushY: ['급행 (세팅 비용 60만원부터)', 'Rush (set-up fee from KRW 600,000)'],
  odSetup: ['사출 세팅 비용', 'Moulding set-up fee'],
  odPlasNote: ['플라스틱은 사급(판재·사출품을 보내 주시는 것)을 기본으로 합니다. 사출도 해 드릴 수 있지만 날을 잡아 모아서 진행하므로 연락드린 뒤 일정을 정합니다. 급하게 필요하시면 세팅 비용이 60만원부터 들어갑니다.', 'Plastics are customer-supplied by default (send us the sheet or mouldings). We can mould them, but runs are batched on set dates, so we contact you to agree the schedule. For urgent work a set-up fee from KRW 600,000 applies.'],
  odRubNote: ['고무는 사급(판재를 보내 주시는 것)을 기본으로 합니다. 판재 공급이 필요하면 별도 견적으로 회신드립니다.', 'Rubber is customer-supplied by default (send us the sheet). If you need us to supply the sheet, it is quoted separately by reply.'], odTotalEx: ['예상 금액 (판 값 제외, 부가세 포함)', 'Estimated total (panel excluded, VAT included)'],
  odPeek: ['PEEK는 확실히 더 비쌉니다. 소재 값이 ABS·PC의 약 50~60배이고, 사출 뒤 어닐링과 사출기 세척 공정이 더 들어갑니다. PEEK 사출은 세팅 비용 60만원부터 시작하고, 판 값은 별도 견적으로 회신드립니다.', 'PEEK costs considerably more. The resin is roughly 50 to 60 times the price of ABS or PC, and moulding needs an annealing step and a machine purge afterwards. PEEK moulding starts with a set-up fee of KRW 600,000 and up, and the sheet price is quoted separately by reply.'],
  odNotice: ['확정 금액이 아닙니다. 상세 요구사항에 따라 가격은 내려갈 수도, 올라갈 수도 있습니다. 확정 금액과 납기는 회신으로 알려 드립니다.', 'This is not a confirmed price. It may go down or up depending on the detailed requirements. The confirmed price and lead time follow by reply.'],
  odSame: ['복합소재는 탄소섬유·유리섬유 모두 같은 단가입니다. 특수 소재나 다른 조건이 있으면 아래에 표시해 주세요. 따로 연락드립니다.', 'Carbon and glass fibre composites share the same rates. If you have a special material or other conditions, tick the box below and we will contact you.'],
  odThick: ['단가는 3T 기준입니다. 지금 두께는 3T와 달라 금액을 회신으로 확정합니다.', 'Rates are for 3 mm. This thickness differs, so the price will be confirmed by reply.'],
  odConsultMat: ['이 재질의 소재 공급은 별도 협의입니다. 표의 금액은 가공비만입니다.', 'Material supply for this material is quoted separately. The table shows machining only.'],
  odConsultAll: ['금속 시편은 장비가 달라 별도 협의입니다. 주문을 보내 주시면 견적을 회신합니다.', 'Metal coupons use a different machine and are quoted separately. Send the order and we will reply with a quote.'],
  odMetalNote: ['금속 시편은 주문 제작이며 사급을 기본으로 합니다. 소재가 필요하시면 판매처에서 직접 구매해 저희 쪽으로 보내 주시면 됩니다. 일본 판매처는 배송대행(예: 몰테일)을 거쳐 받을 수 있습니다. 보내실 곳: 경북 경산시 남매공원로2길 10, 1층 스타웍스. 금액은 주문을 보내 주시면 회신합니다.', 'Metal coupons are made to order and customer-supplied by default. If you need material, buy it from a supplier and have it shipped to us. Japanese suppliers can be reached through a forwarding service such as Malltail. Ship to: STAR Works, 1F, 10 Nammaegongwon-ro 2-gil, Gyeongsan-si, Gyeongsangbuk-do, Korea. Send the order and we will reply with the price.'],
  odMetalShop: ['소재 판매처 예: 非鉄金属.com (일본)', 'Example supplier: 非鉄金属.com (Japan)'],
  odNone: ['수량이 있는 시편이 없습니다.', 'No coupons with a quantity.'],
  odName: ['이름', 'Name'], odOrg: ['회사·기관', 'Company'], odPhone: ['전화번호', 'Phone'], odMail: ['메일', 'Email'], odDue: ['납기 희망일', 'Requested date'], odMemo: ['요청 사항', 'Notes'],
  odReq: ['필수', 'required'], odSpecial: ['특수 소재이거나 다른 조건이 있습니다 (별도 연락 요청)', 'Special material or other conditions (please contact me)'],
  odAgree: ['개인정보 수집·이용에 동의합니다. 항목: 이름, 회사, 전화번호, 메일. 목적: 견적과 주문 상담. 보관: 상담 종료 뒤 1년.', 'I agree to the collection and use of my personal data. Items: name, company, phone, email. Purpose: quotation and order handling. Retention: one year after the enquiry closes.'],
  odSend: ['주문하기', 'Place order'], odSending: ['보내는 중입니다', 'Sending'], odDone: ['주문을 보냈습니다. 확인 뒤 연락드리겠습니다.', 'Order sent. We will contact you after review.'],
  odFail: ['전송에 실패했습니다. 아래 버튼으로 메일을 보내 주세요.', 'Sending failed. Please use the button below to send it by email.'], odMailto: ['메일 프로그램으로 보내기', 'Send with your mail app'],
  odMailOpen: ['메일 프로그램을 열었습니다. 열린 메일을 그대로 보내 주세요. 열리지 않으면 shindongwoo@gmail.com 으로 보내 주세요.', 'Your mail app was opened. Send the prepared message as it is. If nothing opened, write to shindongwoo@gmail.com.'],
  odErrName: ['이름을 넣어 주세요.', 'Enter your name.'], odErrPhone: ['전화번호를 넣어 주세요 (숫자 9자리 이상).', 'Enter a phone number (at least 9 digits).'], odErrMail: ['메일 주소를 확인해 주세요.', 'Check the email address.'], odErrAgree: ['개인정보 동의가 필요합니다.', 'Consent is required.'], odErrNone: ['수량이 있는 시편이 없습니다.', 'There are no coupons to order.'],
  odSubj: ['시편 주문', 'Coupon order'], odSpecialTag: ['별도 협의', 'needs contact'], odPcs: ['개', 'pcs'], odPanel: ['판 크기', 'Panel'], odLayup: ['재질', 'Material'], odCond: ['조건', 'Terms']
});
var Order = (function () {
  'use strict';
  var T = U.T;
  // ---- 단가 표 (원, 부가세 전, 3T 시편 1개) ----
  var PRICE = {
    to: 'shindongwoo@gmail.com', vat: 0.10, baseT: 3.0, tolT: 0.3,
    mach: 25000,   // 가공: 인장 시편 1개 (대표 지시 11-19 23:11)
    tab: 50000,    // 탭 부착: 탭이 붙는 시편 1개 (20만 - 15만)
    // 판 값 (스타웍스 공급일 때, 판 1장): 복합소재는 기준 세트 220만원에서 역산 (BEAM_22, 11-19 23:2x 대표 선택)
    panelCost: { lam: 1475000, plastic: 50000, plasticEng: 100000 },
    setup: 600000,   // 사출 세팅 비용 '부터': 급행일 때, PEEK는 항상 (대표 11-19 23:24)
    engPlastic: { PL_custom: 1 },        // 판 값 10만원: 등급을 모르는 직접 입력만 (가정). PA6·PA6-GF30은 ABS·PC와 같음 (대표 11-19 23:21)
    setupAlways: { PL_PEEK: 1 },         // 세팅 비용을 항상 받는 재질: PEEK (소재 50~60배, 어닐링, 사출기 세척)
    askPanel: { PL_PEEK: 1 },            // 판 값을 자동 계산하지 않고 별도 견적으로 둘 재질 (고무는 종류 전체)
    panel: { L: 400, W: 400, margin: 10, gap: 4 },   // 기본 판, 가장자리 여유, 시편 간격(Ø3 공구, 피치 4)
    k: { tension: 1.0, comp: 0.8, flex: 0.6, vnotch: 0.8, ilss: 0.3, fiber: 0.3,
      ptension: 1.0, pcomp: 0.8, pflex: 0.6, izod: 0.6,
      rtension: 0.5, rtear: 0.5, rcset: 0.2, rhard: 0.2, rplanar: 0.6, rucomp: 0.2 }
  };
  var opt = { supply: 'sw', tab: true, rush: false, kind: null }, cur = null, lastQ = null, sending = false;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function won(v) { return Math.round(v).toLocaleString('en-US'); }
  function r1000(v) { return Math.round(v / 1000) * 1000; }
  // 필요한 판 수: 400 × 400 판에 선반식으로 채움. 시편은 길이 방향을 돌리지 않음 (섬유 방향 유지)
  function panels(rows) {
    var P = PRICE.panel, UL = P.L - 2 * P.margin, UW = P.W - 2 * P.margin, items = [], bins = [], over = false;
    rows.forEach(function (r) { for (var i = 0; i < r.n; i++) items.push({ l: r.shape.len, w: r.shape.w }); });
    items.sort(function (a, b) { return b.w - a.w || b.l - a.l; });
    items.forEach(function (it) {
      if (it.l > UL || it.w > UW) over = true;
      var placed = false, b, s, bin, sh2;
      for (b = 0; b < bins.length && !placed; b++) {
        bin = bins[b];
        for (s = 0; s < bin.shelves.length && !placed; s++) { sh2 = bin.shelves[s]; if (sh2.h >= it.w && sh2.x + it.l <= UL + 1e-9) { sh2.x += it.l + P.gap; placed = true; } }
        if (!placed && bin.y + it.w <= UW + 1e-9) { bin.shelves.push({ h: it.w, x: it.l + P.gap }); bin.y += it.w + P.gap; placed = true; }
      }
      if (!placed) bins.push({ shelves: [{ h: it.w, x: it.l + P.gap }], y: it.w + P.gap });
    });
    return { n: Math.max(1, bins.length), over: over };
  }
  // 견적: o = 물성 시트 계산 결과, op = {supply:'sw'|'own', tab:true|false}
  function quote(o, op) {
    var q = { items: [], sum: 0, vat: 0, total: 0, consultAll: o.kind === 'metal', consultMat: false, thick: Math.abs(o.h - PRICE.baseT) > PRICE.tolT + 1e-9, hasTab: false, n: 0, panelN: 0, panelUnit: 0, panelSum: 0, panelOver: false, setup: 0 };
    if (op.supply === 'sw' && !q.consultAll && o.rows.length) {
      var pn = panels(o.rows), pc = PRICE.panelCost;
      q.panelN = pn.n; q.panelOver = pn.over;
      q.panelUnit = o.kind === 'lam' ? pc.lam : (PRICE.engPlastic[o.mat] ? pc.plasticEng : pc.plastic);
      if (o.kind !== 'lam') q.consultMat = true;                                   // 플라스틱·고무 공급은 연락해서 일정·값을 정함
      if (o.kind === 'rubber' || PRICE.askPanel[o.mat]) q.panelUnit = null;        // 별도 견적
      if (o.kind === 'plastic' && (op.rush || PRICE.setupAlways[o.mat])) { q.setup = PRICE.setup; q.sum += q.setup; }
      q.peek = o.mat === 'PL_PEEK';
      q.panelSum = q.panelUnit === null ? 0 : q.panelN * q.panelUnit; q.sum += q.panelSum;
    }
    o.rows.forEach(function (r) {
      var k = PRICE.k[r.key], tabbed = !!r.tab && o.kind === 'lam', unit = null;
      if (tabbed) q.hasTab = true;
      if (!q.consultAll && k) unit = PRICE.mach * k + (op.tab && tabbed ? PRICE.tab : 0);
      q.items.push({ key: r.key, name: r.name || T('t_' + r.key), std: r.std, size: r.size, n: r.n, unit: unit, sub: unit === null ? null : unit * r.n, tab: op.tab && tabbed });
      q.n += r.n; if (unit !== null) q.sum += unit * r.n;
    });
    q.sum = r1000(q.sum); q.vat = r1000(q.sum * PRICE.vat); q.total = q.sum + q.vat;
    return q;
  }
  function matName(o) { return (o.lam ? o.L.label : o.m.name) + ', ' + U.fix(o.h, 2) + ' mm'; }
  function render(o) {
    cur = o; var host = $('ordQuote'); if (!host) return;
    if (opt.kind !== o.kind) { opt.kind = o.kind; opt.supply = o.kind === 'lam' ? 'sw' : 'own'; opt.rush = false; }   // 복합소재만 공급이 기본, 나머지는 사급이 기본
    var q = lastQ = quote(o, opt), s = '', always = !!PRICE.setupAlways[o.mat];
    $('odRushL').hidden = !(o.kind === 'plastic' && opt.supply === 'sw'); $('odRush').value = opt.rush || always ? '1' : '0'; $('odRush').disabled = always;
    $('odSupply').value = opt.supply; $('odTab').value = opt.tab ? '1' : '0';
    $('odTab').disabled = !q.hasTab;
    if (!q.items.length) { host.innerHTML = '<p class="note">' + T('odNone') + '</p>'; return; }
    s += '<div class="tw"><table class="ds ord"><thead><tr><th>' + T('odItem') + '</th><th>' + T('odQty') + '</th><th>' + T('odUnit') + '</th><th>' + T('odSubt') + '</th></tr></thead><tbody>';
    q.items.forEach(function (it) {
      s += '<tr><th scope="row"><i class="sw pc-' + it.key + '"></i>' + esc(it.name) + (it.tab ? ' <span class="chip">' + T('odTabIn') + '</span>' : '') + '</th><td class="nv">' + it.n + '</td><td class="nv">' + (it.unit === null ? '–' : won(it.unit)) + '</td><td class="nv">' + (it.sub === null ? '–' : won(it.sub)) + '</td></tr>';
    });
    if (q.panelN) s += '<tr><th scope="row">' + T(o.kind === 'lam' ? 'odPanelLam' : 'odPanelSheet') + '</th><td class="nv">' + q.panelN + ' ' + T('odPcsU') + '</td><td class="nv">' + (q.panelUnit === null ? T('odAsk') : won(q.panelUnit) + (q.from ? ' ' + T('odFrom') : '')) + '</td><td class="nv">' + (q.panelUnit === null ? T('odAsk') : won(q.panelSum) + (q.from ? ' ' + T('odFrom') : '')) + '</td></tr>';
    if (q.setup) s += '<tr><th scope="row">' + T('odSetup') + '</th><td class="nv">1</td><td class="nv">' + won(q.setup) + ' ' + T('odFrom') + '</td><td class="nv">' + won(q.setup) + ' ' + T('odFrom') + '</td></tr>';
    s += '</tbody>';
    if (!q.consultAll) s += '<tfoot><tr><th scope="row" colspan="3">' + T('odSum') + '</th><td class="nv">' + won(q.sum) + '</td></tr><tr><th scope="row" colspan="3">' + T('odVat') + '</th><td class="nv">' + won(q.vat) + '</td></tr><tr class="tot"><th scope="row" colspan="3">' + T(q.consultMat && q.panelUnit === null ? 'odTotalEx' : 'odTotal') + '</th><td class="nv"><b>' + won(q.total) + '</b> ' + T('odWon') + '</td></tr></tfoot>';
    s += '</table></div>';
    if (q.consultAll) s += '<p class="note warn notice">' + T('odMetalNote') + ' <a href="https://hitetsukinzoku.com" target="_blank" rel="noopener noreferrer">' + T('odMetalShop') + '</a></p>';
    if (o.kind === 'plastic' || o.kind === 'rubber') s += '<p class="note warn notice">' + T(o.kind === 'plastic' ? 'odPlasNote' : 'odRubNote') + '</p>';
    if (q.peek) s += '<p class="note warn notice">' + T('odPeek') + '</p>';
    if (q.panelN) s += '<p class="note">' + T('odOnePanel') + '</p>';
    if (q.thick && !q.consultAll) s += '<p class="note warn notice">' + T('odThick') + '</p>';
    if (o.kind === 'lam') s += '<p class="note">' + T('odSame') + '</p>';
    host.innerHTML = s;
    $('ordMat').textContent = matName(o);
  }
  // ---- 주문 내용 ----
  function val(id) { var e = $(id); return e ? String(e.value || '').trim() : ''; }
  function payload() {
    var o = cur, q = lastQ;
    return {
      lang: U.getLang(), page: location.href.slice(0, 200),
      name: val('odName'), org: val('odOrg'), phone: val('odPhone'), email: val('odMail'), due: val('odDue'), memo: val('odMemo'),
      special: $('odSpecial').checked, supply: opt.supply, tab: opt.tab && q.hasTab, material: matName(o), kind: o.kind,
      panel: Math.ceil(o.lay.L) + ' x ' + Math.ceil(o.lay.W) + ' x ' + U.fix(o.h, 2) + ' mm' + (q.panelN ? ', ' + T('odPcsU') + ' ' + q.panelN + ' = ' + (q.panelUnit === null ? T('odAsk') : won(q.panelSum)) : '') + (q.setup ? ', ' + T('odSetup') + ' ' + won(q.setup) + ' ' + T('odFrom') : ''), panelN: q.panelN, panelSum: q.panelSum, thick: q.thick || q.panelOver, consult: q.consultAll || q.consultMat,
      sum: q.sum, vat: q.vat, total: q.total, count: q.n,
      items: q.items.map(function (it) { return { name: it.name, std: it.std, size: String(it.size).replace(/×/g, 'x'), n: it.n, unit: it.unit, sub: it.sub, tab: it.tab }; }),
      website: val('odWeb')
    };
  }
  function check(p) {
    if (!cur || !lastQ || !lastQ.items.length) return ['odErrNone', null];
    if (p.name.length < 1) return ['odErrName', 'odName'];
    if (p.phone.replace(/\D/g, '').length < 9) return ['odErrPhone', 'odPhone'];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(p.email)) return ['odErrMail', 'odMail'];
    if (!$('odAgree').checked) return ['odErrAgree', 'odAgree'];
    return null;
  }
  function subject(p) {
    return '[' + T('odSubj') + (p.special || p.thick || p.consult ? ', ' + T('odSpecialTag') : '') + '] ' + p.material + ', ' + p.count + ' ' + T('odPcs') + (p.total ? ', ' + won(p.total) + ' ' + T('odWon') : '');
  }
  function bodyText(p) {
    var L = [];
    L.push(T('odName') + ': ' + p.name + (p.org ? ' / ' + p.org : '')); L.push(T('odPhone') + ': ' + p.phone); L.push(T('odMail') + ': ' + p.email);
    if (p.due) L.push(T('odDue') + ': ' + p.due);
    L.push(''); L.push(T('odLayup') + ': ' + p.material); L.push(T('odPanel') + ': ' + p.panel);
    L.push(T('odCond') + ': ' + T(p.supply === 'sw' ? 'odSw' : 'odOwn') + ', ' + T('odTab') + ' ' + T(p.tab ? 'odTabY' : 'odTabN') + (p.special ? ', ' + T('odSpecial') : ''));
    L.push('');
    p.items.forEach(function (it) { L.push('- ' + it.name + ' ' + it.size + ' : ' + it.n + ' ' + T('odPcs') + (it.sub === null ? '' : ' = ' + won(it.sub))); });
    if (p.total) L.push(T('odTotal') + ': ' + won(p.total) + ' ' + T('odWon'));
    if (p.memo) { L.push(''); L.push(T('odMemo') + ': ' + p.memo); }
    return L.join('\n');
  }
  function mailto(p) { return 'mailto:' + PRICE.to + '?subject=' + encodeURIComponent(subject(p)) + '&body=' + encodeURIComponent(bodyText(p).slice(0, 1500)); }
  function msg(key, cls) { var m = $('ordMsg'); m.textContent = key ? T(key) : ''; m.className = 'ord-msg' + (cls ? ' ' + cls : ''); m.setAttribute('data-k', key || ''); }
  function send() {
    if (sending) return;
    var p = payload(), er = check(p), url = window.SITE && window.SITE.order, fb = $('odFallback');
    fb.hidden = true;
    if (er) { msg(er[0], 'bad'); if (er[1]) { var e = $(er[1]); e.focus(); } return; }
    if (!url) { fb.href = mailto(p); msg('odMailOpen', 'ok'); fb.hidden = false; try { location.href = fb.href; } catch (x) { /* 막힌 환경 */ } return; }
    sending = true; $('odSend').disabled = true; msg('odSending', '');
    fetch(url, { method: 'POST', body: JSON.stringify(p), redirect: 'follow' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error('fail');
      msg('odDone', 'ok');
    }).catch(function () { fb.href = mailto(p); fb.hidden = false; msg('odFail', 'bad'); }).then(function () { sending = false; $('odSend').disabled = false; });
  }
  function init() {
    var c = $('ordCard'); if (!c) return;
    c.addEventListener('change', function (ev) {
      ev.stopPropagation(); var e = ev.target;
      if (e.id === 'odSupply') { opt.supply = e.value === 'own' ? 'own' : 'sw'; if (cur) render(cur); }
      else if (e.id === 'odTab') { opt.tab = e.value === '1'; if (cur) render(cur); }
      else if (e.id === 'odRush') { opt.rush = e.value === '1'; if (cur) render(cur); }
    });
    c.addEventListener('click', function (ev) { ev.stopPropagation(); });
    $('ordForm').addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
  }
  function relang() { if (cur) render(cur); var m = $('ordMsg'); if (m && m.getAttribute('data-k')) m.textContent = T(m.getAttribute('data-k')); }
  return { PRICE: PRICE, panels: panels, quote: quote, render: render, init: init, relang: relang, opt: opt, payload: payload, subject: subject, bodyText: bodyText, check: check };
})();

/* sheet.js: 물성 시트 탭 (적층 편집기, 목표 대비 예상, 변위-하중·응력 곡선, 시편 치수와 판 크기) */
Object.assign(I18N, {
  cat_lam: ['복합소재', 'Composite'], cat_plastic: ['사출 플라스틱', 'Injection plastic'], cat_rubber: ['고무', 'Rubber'], cat_metal: ['금속', 'Metal'], shKind: ['종류', 'Grade'],
  tabBeam: ['시뮬레이션', 'Simulation'], tabSheet: ['물성 시트', 'Material sheet'],
  mat_LAM: ['적층 복합재 (에폭시)', 'Laminate (epoxy)'],
  matNoteLam: ['층 물성은 문헌 참고값입니다. 안전율은 첫 층 파손 기준입니다.', 'Ply data are literature reference values. Safety factor is at first-ply failure.'],
  lmPlies: ['층', 'plies'], lmEdit: ['적층 편집', 'Edit layup'],
  lmFlat: ['판을 눕힌 보: 높이 h = 적층 두께', 'Laminate laid flat: depth h = laminate thickness'],
  lmWall: ['벽 두께 t = 적층 두께', 'Wall thickness t = laminate thickness'],
  largeDefl: ['처짐이 길이의 10 %를 넘습니다. 미소 변형 가정을 벗어납니다.', 'Deflection exceeds 10 % of the length; small-deflection theory no longer holds.'],
  vfWarn: ['섬유 체적률이 35 ~ 70 % 밖입니다. 1층 두께와 평량을 확인해 주세요.', 'Fibre volume fraction is outside 35–70 %. Check ply thickness and areal weight.'],
  m_cf_ud: ['CFRP 일방향', 'CFRP UD'], m_gf_ud: ['GFRP 일방향', 'GFRP UD'], m_cf_fab: ['CFRP 직물', 'CFRP fabric'], m_gf_fab: ['GFRP 직물', 'GFRP fabric'],
  shMat: ['재질', 'Material'], shCustomNote: ['직접 입력 값은 보 해석 탭에서 고칩니다.', 'Edit custom values on the Beam tab.'],
  shPlate: ['판 두께', 'Plate thickness'],
  shPlyMats: ['층 소재', 'Ply materials'], shThk: ['1층 두께', 'Ply thickness'], shFaw: ['섬유 평량', 'Fibre areal wt'], shVf: ['섬유 체적률', 'Fibre vol.'],
  shProps: ['물성', 'Properties'], shCorr: ['섬유함량 보정: 1층 두께를 바꾸면 E1·강도를 체적률에 맞춰 보정', 'Fibre-content correction: scale E1 and strength with volume fraction when ply thickness changes'],
  shResin: ['수지 (밀도, 탄성률, 전단 탄성률)', 'Resin (density, modulus, shear modulus)'], shReset: ['기본값으로', 'Reset to defaults'],
  shLayup: ['적층', 'Layup'], shPreset: ['예시 적층', 'Example layup'], shPick: ['선택', 'Choose'],
  ps_ud0: ['일방향 0°', 'Unidirectional 0°'], ps_cross: ['직교 0/90', 'Cross-ply 0/90'], ps_quasi: ['준등방 0/45/−45/90', 'Quasi-isotropic 0/45/−45/90'],
  ps_pm45: ['±45', '±45'], ps_fabric: ['CFRP 직물', 'CFRP fabric'], ps_hybrid: ['유리 코어 + 탄소 직물 스킨', 'Glass core + carbon fabric skins'],
  shAdd: ['층 추가', 'Add ply'], shSym: ['대칭 (목록을 뒤집어 한 번 더 쌓음)', 'Symmetric (mirror the list)'], shRep: ['반복 수', 'Repeats'],
  shTgt: ['목표 두께', 'Target thickness'], shFit: ['반복 수 맞춤', 'Fit repeats'], shUp: ['위로', 'Move up'], shDn: ['아래로', 'Move down'], shRm: ['삭제', 'Remove'],
  shStack: ['적층 단면', 'Stack'], shTotal: ['총 두께', 'Total thickness'], shTop: ['윗면', 'top'], shBal: ['균형', 'balanced'], shUnbal: ['불균형', 'unbalanced'], shSymm: ['대칭', 'symmetric'], shUnsym: ['비대칭', 'unsymmetric'],
  shCap: ['층 수가 400을 넘어 반복 수를 줄였습니다.', 'More than 400 plies; repeats were reduced.'],
  shData: ['물성 데이터 시트', 'Property data sheet'], shItem: ['항목', 'Property'], shUnit: ['단위', 'Unit'], shTarget: ['목표', 'Target'], shPred: ['예상', 'Predicted'], shVerdict: ['판정', 'Verdict'], shStd: ['시험 규격', 'Standard'], shRemark: ['비고', 'Remarks'],
  r_ts: ['인장강도', 'Tensile strength'], r_te: ['인장탄성률', 'Tensile modulus'], r_fs: ['굴곡강도', 'Flexural strength'], r_fe: ['굴곡탄성률', 'Flexural modulus'], r_ilss: ['ILSS', 'ILSS'], r_vn: ['V노치 강도', 'V-notch strength'], r_wf: ['섬유함량', 'Fibre content'],
  vOk: ['만족', 'Pass'], vNg: ['미달', 'Below'], vIn: ['입력값', 'Input'], vNa: ['해당 없음', 'n/a'],
  shFpf: ['첫 층 파손', 'First-ply failure'], shUlt: ['최종 파손', 'Ultimate'], shYield: ['항복', 'Yield'],
  md0: ['섬유 방향', 'fibre direction'], md1: ['섬유 직각 방향', 'transverse'], md2: ['면내 전단', 'in-plane shear'], sgT: ['인장', 'tension'], sgC: ['압축', 'compression'],
  shIlssIn: ['입력한 층간 전단 강도에서 나온 값입니다. 실측값으로 바꿔 주세요.', 'Comes from the interlaminar shear strength you entered. Replace it with a measured value.'],
  shShearFirst: ['전단 파손이 먼저 납니다. 지점 거리 비를 키워 주세요.', 'Shear failure comes first. Increase the span ratio.'],
  shFlexFirst: ['굽힘 파손이 먼저 납니다.', 'Bending failure comes first.'],
  shMore: ['푸아송비', 'Poisson ratio'], shRho: ['밀도', 'Density'], shAreal: ['면밀도', 'Areal weight'], shComp: ['압축 첫 층 파손', 'Compression first-ply failure'], shG: ['전단 탄성률', 'Shear modulus'],
  shPredNote: ['예상값은 고전 적층 이론과 층 제외법으로 구한 값이며 시험값과 차이가 날 수 있습니다. 판정은 최종 파손 기준입니다.', 'Predictions use classical lamination theory with ply discount and may differ from test results. Verdicts use ultimate failure.'],
  shNotBal: ['인장 규격(D3039)은 균형·대칭 적층이 조건입니다.', 'The tensile standard (D3039) requires a balanced, symmetric laminate.'],
  shCurve: ['변위에 따른 하중·응력', 'Load and stress against displacement'], shTest: ['시험', 'Test'],
  t_tension: ['인장 D3039', 'Tension D3039'], t_flex: ['굴곡 D790', 'Flexure D790'], t_ilss: ['ILSS D2344', 'ILSS D2344'], t_vnotch: ['V노치 D5379', 'V-notch D5379'], t_fiber: ['섬유함량 D3171', 'Fibre content D3171'], t_e8: ['인장 E8', 'Tension E8'],
  shXmode: ['변위 기준', 'Displacement'], xGauge: ['표점 거리', 'Gauge length'], xGrip: ['물림 간 거리', 'Grip to grip'],
  shLg: ['표점 거리', 'Gauge length'], shCmp: ['비교 재질', 'Compare with'], shNone: ['없음', 'None'],
  shDisp: ['변위', 'Displacement'], shLoad: ['하중', 'Load'], shStress: ['응력', 'Stress'], shStrain: ['변형률', 'Strain'], shShearStrain: ['전단 변형률', 'Shear strain'],
  shDefl: ['중앙 처짐', 'Mid-span deflection'], shApp: ['겉보기', 'apparent'],
  shGlT: ['표점 거리에 따른 변위량', 'Displacement by gauge length'], shGlMod: ['탄성률 구간 (0.1 → 0.3 %)', 'Modulus range (0.1 → 0.3 %)'], shGlFpf: ['첫 층 파손까지', 'To first-ply failure'], shGlUlt: ['파단까지', 'To failure'], shGlY: ['항복까지', 'To yield'],
  shMetalCurve: ['항복 이후는 규격 최소값을 이은 개략선입니다.', 'Beyond yield the line simply joins the specified minimum values.'],
  shPly: ['층별 사용률', 'Ply utilisation'], shPlyNote: ['막대는 층마다 가장 큰 파손 지수입니다 (손상 전 강성 기준). 1에 닿으면 그 층이 파손합니다.', 'Bars show the largest failure index of each ply (undamaged stiffness). A ply fails at 1.'],
  shTauNote: ['두께 방향 층간 전단 응력 (파단 하중일 때)', 'Through-thickness interlaminar shear stress at the failure load'],
  shSpec: ['시편', 'Specimens'], shQty: ['수량', 'Quantity'], shSpare: ['예비', 'Spare'], shKerf: ['재단 여유 (공구 지름)', 'Cutting allowance (tool dia.)'], shMargin: ['판 가장자리 여유', 'Edge margin'], shRatio: ['굴곡 지점 거리 비', 'Flexure span ratio'],
  shSize: ['폭 × 길이 × 두께 (mm)', 'Width × length × thickness (mm)'], shSpan: ['지점 거리 / 표점', 'Span / gauge'], shRate: ['시험 속도', 'Rate'], shPf: ['예상 파단 하중', 'Expected failure load'],
  shRec: ['권장 두께', 'recommended thickness'], shTab: ['탭', 'tab'], shNoTab: ['탭 없음 (사포 물림)', 'no tabs (emery cloth)'], shNotchW: ['노치 사이', 'between notches'], shDepth: ['노치 깊이', 'notch depth'],
  shSbsRange: ['규격 두께 범위(2 ~ 6 mm) 밖입니다.', 'Outside the standard thickness range (2–6 mm).'],
  shMem: ['† 규격 원문과 대조가 필요한 치수입니다.', '† Dimensions to be checked against the standard text.'],
  shPanel: ['필요 판 크기', 'Panel size needed'], shPanelNote: ['길이 방향이 섬유 0° 방향입니다. 시편 사이 간격은 재단 여유입니다.', 'Length runs along the 0° fibre direction. Gaps between specimens are the cutting allowance.'],
  shLen: ['길이', 'Length'], shWid: ['폭', 'Width'], shThick: ['두께', 'Thickness'], shSupport: ['지점 거리', 'Span'], shPcs: ['개', 'pcs'],
  shScale: ['치수 1:1 mm, 그림은 화면에 맞춰 축소', 'Dimensions 1:1 in mm; drawings scaled to fit'],
  tabFab: ['시편 가공', 'Fabrication'], fbGo: ['시편 가공 탭에서 재단 배치·도면 저장', 'Layout and drawings on the Fabrication tab'],
  fbLay: ['재단 배치', 'Cutting layout'], fbDraw: ['도면 저장', 'Save drawings'], fbDrawNote: ['치수 1:1, 단위 mm. DXF는 R12 형식이며 외형선은 녹색 층(OUTLINE)입니다. 재단용은 판과 시편 외곽, 도면용은 시편별 치수를 담습니다.', 'Scale 1:1 in mm. DXF is R12 with outlines on the green OUTLINE layer. Cutting files hold the panel and outlines; drawing files hold dimensions per specimen.'],
  fbCutSvg: ['재단용 SVG', 'Cutting SVG'], fbCutDxf: ['재단용 DXF', 'Cutting DXF'], fbDrSvg: ['도면용 SVG', 'Drawing SVG'], fbDrDxf: ['도면용 DXF', 'Drawing DXF'],
  fbCam: ['루타 가공·시뮬레이션', 'Router machining and simulation'], fbCamNote: ['전에 만든 RichAuto 시편 CAM·시뮬레이터입니다. 위 재단 배치가 SVG 입력으로 들어가고, 가공 조건(회전수·이송·절입·목표 공구 부하), NC 코드, 2D·3D 시뮬레이션은 CAM 화면에서 다룹니다. 두께와 소재 분류는 자동으로 맞춥니다.', 'This is the RichAuto coupon CAM and simulator made earlier. The layout above goes in as its SVG input; cutting conditions (speed, feed, depth, target tool load), NC code and the 2D/3D simulation are handled in the CAM. Thickness and material class are set automatically.'],
  fbSend: ['재단 배치를 CAM에 넣기', 'Load layout into the CAM'], fbPop: ['CAM을 새 창으로', 'Open CAM in a new window'], fbPopOk: ['새 창을 열었습니다. 새 창에서는 재단용 SVG를 저장해 SVG 파일로 여세요.', 'New window opened. There, save the cutting SVG and open it as an SVG file.'], fbPopNo: ['이 환경에서는 새 창이 열리지 않습니다.', 'A new window cannot be opened here.'], fbSent: ['CAM에 넣었습니다:', 'Loaded into the CAM:'], fbNoMat: ['CAM에 이 재질의 가공 조건이 없습니다. CAM에서 소재를 직접 고르세요.', 'The CAM has no cutting data for this material. Choose the material in the CAM.'], fbSentNoWin: ['재단 배치를 저장했습니다. CAM 창이 열리지 않으면 재단용 SVG를 저장해 CAM에서 여세요.', 'Layout stored. If the CAM window did not open, save the cutting SVG and open it in the CAM.'], fbSendFail: ['CAM에 넣지 못했습니다. 재단용 SVG를 저장해 CAM의 SVG 파일 열기로 넣어 주세요.', 'Could not load into the CAM. Save the cutting SVG and use the CAM\'s SVG file input.'],
  fbMach: ['장비', 'Machines'], fbM1: ['미스터조각기 MR-LM6090 · RichAuto A11', 'MR-LM6090 router · RichAuto A11'], fbM2: ['마하 보드 (Mach3) 조각기', 'Mach3 board router'], fbM3: ['두산 MCT (Fanuc)', 'Doosan machining centre (Fanuc)'],
  fbSim: ['NC + 시뮬레이션', 'NC + simulation'], fbFmt: ['NC 형식', 'NC format'], fbMachNote: ['NC 출력과 시뮬레이션은 아래 시편 CAM에서 합니다. 지금은 미스터조각기(RichAuto)만 지원하고, 다른 장비는 이름만 표시합니다.', 'NC output and simulation run in the coupon CAM below. Only the MR-LM6090 (RichAuto) is supported for now; other machines are listed by name only.'],
  shParallel: ['평행부', 'Reduced section'], shCnt: ['겹 수', 'Ply count'], r_cs: ['압축강도', 'Compressive strength']
});

var Sheet = (function () {
  'use strict';
  var T = U.T, api, $, lastMode = null, R = null;
  var MK = ['cf_ud', 'gf_ud', 'cf_fab', 'gf_fab'], MATK = ['LAM'].concat(Object.keys(Spec.RUB), Object.keys(Spec.PLAS), ['SS400', 'S235', 'STS304', 'AL6061', 'custom']);
  var PROPS = [['E1', 'GPa'], ['E2', 'GPa'], ['G12', 'GPa'], ['nu12', ''], ['G13', 'GPa'], ['G23', 'GPa'], ['Xt', 'MPa'], ['Xc', 'MPa'], ['Yt', 'MPa'], ['Yc', 'MPa'], ['S12', 'MPa'], ['S13', 'MPa'], ['vf0', ''], ['rhof', 'g/cm³']];
  var sh = { test: 'tension', xmode: 'gauge', Lg: 50, cmp: 'none', cur: 1, ratio: 16, kerf: 4, margin: 10, plen: 0, mt: 3, tgtH: 3, cstd: 'D6641', d638: 'auto', rstd: 'ASTM', mform: 'flat', mround: 'E8_12', q: {}, cam: 'RichAuto_시편CAM.html',
    inc: {}, open: {},
    tg: { ts: 900, te: 45, cs: 0, fs: 800, fe: 40, ilss: 70, vn: 70, wf: 34 } };
  var STD = { q_hs: 'ASTM D2240', q_su: 'ASTM D412', q_el: 'ASTM D412', q_m100: 'ASTM D412', q_tear: 'ASTM D624', q_cs: 'ASTM D395', q_rho: 'ASTM D297', cs: 'ASTM D6641 / D3410 / D695', p_su: 'ASTM D638', p_E: 'ASTM D638', p_el: 'ASTM D638', p_sf: 'ASTM D790', p_Ef: 'ASTM D790', p_sc: 'ASTM D695', p_iz: 'ASTM D256', p_rho: 'ASTM D792', ts: 'ASTM D3039', te: 'ASTM D3039', fs: 'ASTM D790', fe: 'ASTM D790', ilss: 'ASTM D2344', vn: 'ASTM D5379', wf: 'ASTM D3171' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function f(v, d) { return U.fix(v, d); }
  function g(v, n) { return U.sig(v, n || 3); }
  function hue(t) { t = Math.max(0, Math.min(1, t)); return 'hsl(' + (240 * (1 - t)).toFixed(0) + ',85%,48%)'; }
  function clampN(v, a, b, d) { v = parseFloat(v); if (!isFinite(v)) return d; return Math.max(a, Math.min(b, v)); }

  // 재질 4분류: 복합소재, 사출 플라스틱, 고무, 금속
  var CATS = { lam: ['LAM'], plastic: Object.keys(Spec.PLAS), rubber: Object.keys(Spec.RUB), metal: ['SS400', 'S235', 'STS304', 'AL6061', 'custom'] }, CATK = ['lam', 'plastic', 'rubber', 'metal'], lastIn = {};
  function catOf(m) { return m === 'LAM' ? 'lam' : Spec.PLAS[m] ? 'plastic' : Spec.RUB[m] ? 'rubber' : 'metal'; }
  // ---------- 계산 ----------
  function compute() {
    var mat = api.st.mat, o = { mat: mat, kind: mat === 'LAM' ? 'lam' : (Spec.PLAS[mat] ? 'plastic' : (Spec.RUB[mat] ? 'rubber' : 'metal')) };
    o.lam = o.kind === 'lam';
    if (o.lam) {
      var L = Lam.build(api.cfg()); o.L = L; o.h = L.h; o.d = o.sp = Spec.lamDims(L, sh); o.geo = o.d.geo;
      o.t = Lam.tests(L, o.geo); o.all = Spec.lamRows(o.d, o.t, sh); o.tests = ['tension', 'comp', 'flex', 'ilss', 'vnotch'];
    } else if (o.kind === 'plastic') {
      o.pl = api.plas(mat); o.m = api.matInfo(); o.h = sh.mt; o.d = Spec.plasDims(o.h, sh);
      o.all = Spec.plasRows(o.d, o.pl, sh); o.tests = ['ptension', 'pcomp', 'pflex'];
    } else if (o.kind === 'rubber') {
      o.rb = api.rub(mat); o.m = api.matInfo(); o.h = sh.mt; o.d = Spec.rubDims(o.h, sh); o.y = Spec.yeoh(o.rb); o.G = o.y.G;
      o.all = Spec.rubRows(o.d, o.rb, sh); o.tests = ['rtension', 'rucomp', 'rplanar'];
    } else {
      var m = api.matInfo(); o.m = m; o.h = sh.mt;
      o.sy = m.crit.type === 'vm' ? m.crit.sy : m.crit.xt; o.su = m.su || o.sy; o.el = m.el || 0;
      o.all = Spec.metalRows(o.h, o.su, sh); o.tests = ['e8'];
      if (o.all[0].round) { o.round = o.all[0]; o.h = o.round.round.D; o.area = Math.PI * o.h * o.h / 4; }
    }
    o.all.forEach(function (r) { var q = sh.q[r.key]; r.n = sh.inc[r.key] === false ? 0 : (q === undefined ? (r.n0 || 7) : q); });
    o.rows = o.all.filter(function (r) { return r.n > 0; });
    o.lay = Spec.layout(o.rows.filter(function (r) { return !r.round; }), { kerf: sh.kerf, margin: sh.margin, plen: sh.plen });
    if (o.tests.indexOf(sh.test) < 0) sh.test = o.tests[0];
    return o;
  }
  function testName(k) { return k === 'comp' ? T('t_comp') + ' ' + sh.cstd : T('t_' + k); }
  function evTxt(ev) {
    if (!ev) return '';
    return ev.a + '° ' + T('m_' + ev.m) + ' #' + (ev.i + 1) + ', ' + T('md' + ev.mode) + (ev.sign ? ' ' + T(ev.sign > 0 ? 'sgT' : 'sgC') : '');
  }
  function metalPts(E, sy, su, el) {
    var p = [[0, 0], [sy / E, sy]];
    if (el > 0 && su >= sy) p.push([el / 100, su]);
    return p;
  }

  // 곡선: pts = [x, 하중 N, 응력 MPa, 변형률]
  function curve(o, test) {
    var c = { pts: [], marks: [], xl: T('shDisp') + ' (mm)', sl: T('shStress') + ' (MPa)', cmp: null, note: '', test: test }, i, q, h = o.h;
    if (test === 'e8') {
      var A = o.area || 12.5 * h, Lx = o.round ? (sh.xmode === 'gauge' ? o.round.gauge : o.round.round.A) : (sh.xmode === 'gauge' ? sh.Lg : 100), mp = metalPts(o.m.E, o.sy, o.su, o.el);
      c.pts = mp.map(function (p) { return [p[0] * Lx, p[1] * A, p[1], p[0]]; });
      c.marks.push({ i: 1, t: T('shYield') }); if (mp.length > 2) c.marks.push({ i: 2, t: T('r_ts') });
      c.note = T('shMetalCurve'); c.best = c.pts.length - 1; return c;
    }
    if (o.kind === 'rubber') {
      var lb = 1 + o.rb.el / 100, nn = 40, tt = o.d.ten, kk, lam, sg;
      for (kk = 0; kk <= nn; kk++) {
        if (test === 'rtension') { lam = 1 + (lb - 1) * kk / nn; sg = Spec.rubS(o.y, 'u', lam); c.pts.push([(lam - 1) * (sh.xmode === 'gauge' ? tt.G : tt.A), sg * tt.W * h, sg, lam - 1]); }
        else if (test === 'rucomp') { lam = 1 - 0.25 * kk / nn; sg = -Spec.rubS(o.y, 'u', lam); c.pts.push([(1 - lam) * 12.5, sg * Math.PI * 14.5 * 14.5, sg, 1 - lam]); }
        else { lam = 1 + Math.min(o.rb.el / 100, 1.5) * kk / nn; sg = Spec.rubS(o.y, 'p', lam); c.pts.push([(lam - 1) * 15, sg * 150 * h, sg, lam - 1]); }
      }
      c.best = nn; if (test === 'rtension') c.marks.push({ i: nn, t: T('shUlt') }); c.note = T('rbNotice'); return c;
    }
    if (o.kind === 'plastic') {
      var pl = o.pl, d = o.d, E = pl.E * 1000;
      if (test === 'ptension') {
        var Ap = d.g.W * h, Lp = sh.xmode === 'gauge' ? d.g.G : d.g.D, pp = [[0, 0], [pl.su / E, pl.su]];
        if (pl.el / 100 > pl.su / E) pp.push([pl.el / 100, pl.su]);
        c.pts = pp.map(function (p) { return [p[0] * Lp, p[1] * Ap, p[1], p[0]]; });
        c.marks.push({ i: 1, t: T('pl_su') }); c.best = c.pts.length - 1; c.note = T('shMetalCurve'); c.yieldI = 1;
      } else if (test === 'pcomp') {
        c.pts = [[0, 0, 0, 0], [pl.sc / E * d.comp.lg, pl.sc * d.comp.W * d.comp.T, pl.sc, pl.sc / E]]; c.marks.push({ i: 1, t: T('pl_sc') }); c.best = 1;
      } else {
        var sp = d.flex.span, Pf = 2 * d.flex.w * h * h * pl.sf / (3 * sp), ef = pl.sf / (pl.Ef * 1000);
        c.pts = [[0, 0, 0, 0], [ef * sp * sp / (6 * h), Pf, pl.sf, ef]]; c.xl = T('shDefl') + ' (mm)'; c.marks.push({ i: 1, t: T('pl_sf') }); c.best = 1;
      }
      return c;
    }
    var t = o.t, sp2 = o.sp;
    if (test === 'tension' || test === 'comp') {
      var ten = test === 'tension', w = ten ? sp2.tension.w : sp2.comp.W, R2 = ten ? t.tension : t.comp, Lg = ten ? (sh.xmode === 'gauge' ? sh.Lg : sp2.tension.grip) : sp2.comp.lg;
      c.pts = R2.curve.map(function (p) { return [p[0] * Lg, p[1] * w * h, p[1], p[0]]; });
      if (ten && sh.cmp !== 'none' && api.MATS[sh.cmp]) {
        var dm = api.MATS[sh.cmp];
        c.cmp = { name: sh.cmp, pts: metalPts(dm.E * 1000, dm.crit.sy, dm.su, dm.el).map(function (p) { return [p[0] * Lg, p[1] * w * h]; }) };
      }
      if (!ten && t.comp.buckFirst) c.note = T('spBuck');
    } else if (test === 'flex') {
      c.pts = t.flex.curve.map(function (p) { return [p[0], p[1], p[2], 6 * p[0] * h / (sp2.flex.span * sp2.flex.span)]; });
      c.xl = T('shDefl') + ' (mm)';
      if (t.flex.shearFirst) c.note = T('shShearFirst');
    } else if (test === 'ilss') {
      c.pts = [[0, 0, 0, 0], [t.ilss.D, t.ilss.P, t.ilss.F, 0]];
      c.xl = T('shDefl') + ' (mm)'; c.sl = T('shApp') + ' ' + T('shStress') + ' (MPa)';
      c.note = t.ilss.flexFirst ? T('shFlexFirst') : T('shIlssIn');
    } else {
      var wn = sp2.vnotch.wn;
      c.pts = t.vnotch.curve.map(function (p) { return [p[0] * 100, p[1] * wn * h, p[1], p[0]]; });
      c.xl = T('shShearStrain') + ' (%)';
    }
    var best = 0;
    for (i = 0; i < c.pts.length; i++) if (c.pts[i][1] > c.pts[best][1]) best = i;
    if (test !== 'ilss') {
      for (i = 1; i < c.pts.length - 1; i++) if (c.pts[i + 1][0] === c.pts[i][0] && c.pts[i + 1][1] < c.pts[i][1]) { q = i; break; }
      if (q !== undefined && q !== best) { c.marks.push({ i: q, t: T('shFpf') }); c.fpfI = q; }
    }
    c.marks.push({ i: best, t: T('shUlt') }); c.best = best;
    return c;
  }
  function at(pts, x) {
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (x <= b[0] && b[0] > a[0]) { var k = (x - a[0]) / (b[0] - a[0]); return [x, a[1] + k * (b[1] - a[1]), a[2] + k * (b[2] - a[2]), a[3] + k * (b[3] - a[3])]; }
    }
    return pts[pts.length - 1];
  }
  function nice(max, n) { var raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), q = raw / p; return (q < 1.5 ? 1 : q < 3 ? 2 : q < 7 ? 5 : 10) * p; }
  function tickTxt(v, step) { var d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); return f(v, Math.min(d, 4)); }

  function chartSvg(c, curX) {
    var W = 660, H = 310, l = 62, r = 62, t = 16, b = 40, pw = W - l - r, ph = H - t - b, i;
    var xmax = 0, ymax = 0, smax = 0;
    c.pts.forEach(function (p) { xmax = Math.max(xmax, p[0]); ymax = Math.max(ymax, p[1]); smax = Math.max(smax, p[2]); });
    if (!(xmax > 0)) xmax = 1; if (!(ymax > 0)) ymax = 1;
    var kN = ymax >= 10000, ku = kN ? 0.001 : 1, k2 = smax / ymax;
    xmax *= 1.08; ymax *= 1.12;
    var X = function (x) { return l + x / xmax * pw; }, Y = function (y) { return t + ph - y / ymax * ph; };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(T('shCurve')) + '"><defs><clipPath id="shClip"><rect x="' + l + '" y="' + t + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>';
    var sx = nice(xmax, 6), sy = nice(ymax * ku, 5), s2 = nice(ymax * k2, 5), v;
    for (v = 0; v <= xmax + 1e-9; v += sx) s += '<line class="gr" x1="' + X(v) + '" x2="' + X(v) + '" y1="' + t + '" y2="' + (t + ph) + '"/><text class="tk" x="' + X(v) + '" y="' + (t + ph + 16) + '" text-anchor="middle">' + tickTxt(v, sx) + '</text>';
    for (v = 0; v <= ymax * ku + 1e-9; v += sy) s += '<line class="gr" x1="' + l + '" x2="' + (l + pw) + '" y1="' + Y(v / ku) + '" y2="' + Y(v / ku) + '"/><text class="tk" x="' + (l - 7) + '" y="' + (Y(v / ku) + 4) + '" text-anchor="end">' + tickTxt(v, sy) + '</text>';
    if (k2 > 0) for (v = 0; v <= ymax * k2 + 1e-9; v += s2) s += '<text class="tk" x="' + (l + pw + 7) + '" y="' + (Y(v / k2) + 4) + '">' + tickTxt(v, s2) + '</text>';
    s += '<rect class="fr" x="' + l + '" y="' + t + '" width="' + pw + '" height="' + ph + '"/>';
    s += '<text class="ax" x="' + (l + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(c.xl) + '</text>';
    s += '<text class="ax" transform="translate(14 ' + (t + ph / 2) + ') rotate(-90)" text-anchor="middle">' + esc(T('shLoad') + ' (' + (kN ? 'kN' : 'N') + ')') + '</text>';
    s += '<text class="ax" transform="translate(' + (W - 8) + ' ' + (t + ph / 2) + ') rotate(90)" text-anchor="middle">' + esc(c.sl) + '</text>';
    var path = function (pts) { return pts.map(function (p, j) { return (j ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join(''); }; // eslint-disable-line
    if (c.cmp) {
      s += '<path class="cmp" clip-path="url(#shClip)" d="' + path(c.cmp.pts) + '"/>';
      var cp = c.cmp.pts[1]; if (cp[0] < xmax && cp[1] < ymax) s += '<text class="lb dim" x="' + (X(cp[0]) + 6) + '" y="' + (Y(cp[1]) + 14) + '">' + esc(c.cmp.name) + '</text>';
    }
    s += '<path class="cv" d="' + path(c.pts) + '"/>';
    c.marks.forEach(function (m, j) {
      var p = c.pts[m.i], right = X(p[0]) > l + pw * 0.62;
      s += '<circle class="mk' + (j === c.marks.length - 1 ? ' ult' : '') + '" cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4.5"/>';
      s += '<text class="lb" x="' + (X(p[0]) + (right ? -8 : 8)) + '" y="' + (Y(p[1]) + (j === c.marks.length - 1 ? -8 : 16)) + '" text-anchor="' + (right ? 'end' : 'start') + '">' + esc(m.t + ' ' + g(p[2], 4) + ' MPa') + '</text>';
    });
    if (curX !== null) { var q = at(c.pts, curX); s += '<line class="cu" x1="' + X(q[0]) + '" x2="' + X(q[0]) + '" y1="' + t + '" y2="' + (t + ph) + '"/><circle class="cud" cx="' + X(q[0]) + '" cy="' + Y(q[1]) + '" r="4"/>'; }
    return s + '</svg>';
  }

  // ---------- 왼쪽: 편집기 ----------
  function numIn(attr, v, step, min, max, cls) { return '<input class="num ' + (cls || 'sm') + '" type="number" ' + attr + ' value="' + v + '" step="' + step + '" min="' + min + '" max="' + max + '">'; }
  function buildLeft() {
    var cfg = api.cfg(), lam = api.st.mat === 'LAM', s = '', i;
    var cat = catOf(api.st.mat); lastIn[cat] = api.st.mat;
    s += '<section class="grp"><h2 class="grp-h">' + T('shMat') + '</h2><div class="seg" role="group" aria-label="' + esc(T('shMat')) + '">';
    CATK.forEach(function (c) { s += '<button type="button" class="btn" data-cat="' + c + '" aria-pressed="' + (c === cat ? 'true' : 'false') + '">' + T('cat_' + c) + '</button>'; });
    s += '</div><div class="row row-select"' + (CATS[cat].length < 2 ? ' hidden' : '') + '><label class="lab" for="sh_mat">' + T('shKind') + '</label><select id="sh_mat" data-k="mat">';
    CATS[cat].forEach(function (k) { s += '<option value="' + k + '"' + (api.st.mat === k ? ' selected' : '') + '>' + esc(T('mat_' + k)) + '</option>'; });
    s += '</select></div><p class="note" id="shMatNote"></p>';
    if (Spec.RUB[api.st.mat]) {
      var rb = api.rub(api.st.mat); s += '<div class="pgrid pl">';
      Spec.RKEYS.forEach(function (k) { s += '<label>' + T('rb_' + k[0]) + ' <small>' + k[1] + '</small>' + numIn('data-rb="' + k[0] + '"', rb[k[0]], 'any', 0.001, 100000) + '</label>'; });
      s += '</div>';
    }
    if (Spec.PLAS[api.st.mat]) {
      var pl = api.plas(api.st.mat); s += '<div class="pgrid pl">';
      Spec.PKEYS.forEach(function (k) { s += '<label>' + T('pl_' + k[0]) + ' <small>' + k[1] + '</small>' + numIn('data-pl="' + k[0] + '"', pl[k[0]], 'any', 0.001, 100000) + '</label>'; });
      s += '</div>';
    }
    if (!lam) s += '<div class="row row-top"><label class="lab" for="sh_mt">' + T('shPlate') + '</label><span class="numbox">' + numIn('id="sh_mt" data-sh="mt"', sh.mt, 0.1, 0.3, 50, '') + '<span class="unit">mm</span></span></div>';
    s += '</section>';
    if (lam) {
      s += '<section class="grp"><h2 class="grp-h">' + T('shPlyMats') + '</h2><table class="lm-t"><thead><tr><th>' + T('shMat') + '</th><th>' + T('shThk') + '<br>mm</th><th>' + T('shFaw') + '<br>g/m²</th><th>' + T('shVf') + '</th><th></th></tr></thead><tbody>';
      MK.forEach(function (k) {
        var m = cfg.mats[k];
        s += '<tr><td><i class="sw m-' + k + '"></i>' + T('m_' + k) + '</td><td>' + numIn('data-lm="' + k + '.t" aria-label="' + esc(T('m_' + k) + ' ' + T('shThk')) + '"', m.t, 0.005, 0.02, 2) + '</td><td>' + numIn('data-lm="' + k + '.faw" aria-label="' + esc(T('m_' + k) + ' ' + T('shFaw')) + '"', m.faw, 1, 10, 3000) + '</td><td class="nv" id="vf_' + k + '"></td>';
        s += '<td><button type="button" class="btn sm" data-open="' + k + '" aria-expanded="' + (sh.open[k] ? 'true' : 'false') + '">' + T('shProps') + '</button></td></tr>';
        s += '<tr class="lm-d"' + (sh.open[k] ? '' : ' hidden') + ' id="lmd_' + k + '"><td colspan="5"><div class="pgrid">';
        PROPS.forEach(function (p) { s += '<label>' + p[0] + (p[1] ? ' <small>' + p[1] + '</small>' : '') + numIn('data-lm="' + k + '.' + p[0] + '"', m[p[0]], 'any', 0.001, 100000) + '</label>'; });
        s += '</div></td></tr>';
      });
      s += '</tbody></table><div class="row row-check"><input type="checkbox" id="sh_corr" data-lc="corr"' + (cfg.corr ? ' checked' : '') + '><label class="lab" for="sh_corr">' + T('shCorr') + '</label></div>';
      s += '<details class="res"><summary>' + T('shResin') + '</summary><div class="pgrid">';
      [['rho', 'g/cm³'], ['E', 'GPa'], ['G', 'GPa']].forEach(function (p) { s += '<label>' + p[0] + ' <small>' + p[1] + '</small>' + numIn('data-lr="' + p[0] + '"', cfg.resin[p[0]], 'any', 0.1, 100) + '</label>'; });
      s += '</div></details><button type="button" class="btn sm" data-act="resetMats">' + T('shReset') + '</button></section>';
      s += '<section class="grp"><h2 class="grp-h">' + T('shLayup') + '</h2><div class="row row-select"><label class="lab" for="sh_preset">' + T('shPreset') + '</label><select id="sh_preset" data-act="preset"><option value="">' + T('shPick') + '</option>';
      Object.keys(Lam.PRESETS).forEach(function (k) { s += '<option value="' + k + '">' + esc(T('ps_' + k)) + '</option>'; });
      s += '</select></div><ol class="plies">';
      for (i = 0; i < cfg.lam.plies.length; i++) {
        var p = cfg.lam.plies[i];
        s += '<li><span class="pn">' + (i + 1) + '</span><select data-pm="' + i + '" aria-label="' + esc(T('shMat') + ' ' + (i + 1)) + '">';
        MK.forEach(function (k) { s += '<option value="' + k + '"' + (p.m === k ? ' selected' : '') + '>' + T('m_' + k) + '</option>'; }); // eslint-disable-line
        s += '</select>' + numIn('data-pa="' + i + '" aria-label="' + esc((i + 1) + ' °') + '"', p.a, 1, -90, 90) + '<span class="unit">°</span>' + numIn('data-pn="' + i + '" title="' + esc(T('shCnt')) + '" aria-label="' + esc((i + 1) + ' ' + T('shCnt')) + '"', p.n || 1, 1, 1, 60, 'sm cnt') + '<span class="unit">' + T('lmPlies') + '</span>';
        s += '<button type="button" class="btn sm ic" data-up=""' + i + '" aria-label="' + T('shUp') + '"' + (i === 0 ? ' disabled' : '') + '>↑</button><button type="button" class="btn sm ic" data-dn="' + i + '" aria-label="' + T('shDn') + '"' + (i === cfg.lam.plies.length - 1 ? ' disabled' : '') + '>↓</button><button type="button" class="btn sm ic" data-rm="' + i + '" aria-label="' + T('shRm') + '"' + (cfg.lam.plies.length < 2 ? ' disabled' : '') + '>✕</button></li>';
      }
      s += '</ol><button type="button" class="btn sm" data-act="add"' + (cfg.lam.plies.length >= 24 ? ' disabled' : '') + '>' + T('shAdd') + '</button>';
      s += '<div class="row row-check"><input type="checkbox" id="sh_sym" data-ll="sym"' + (cfg.lam.sym ? ' checked' : '') + '><label class="lab" for="sh_sym">' + T('shSym') + '</label></div>';
      s += '<div class="row row-top"><label class="lab" for="sh_rep">' + T('shRep') + '</label><span class="numbox">' + numIn('id="sh_rep" data-ll="rep"', cfg.lam.rep, 1, 1, 20, '') + '</span></div>';
      s += '<div class="row row-top"><label class="lab" for="sh_tgt">' + T('shTgt') + '</label><span class="numbox">' + numIn('id="sh_tgt" data-sh="tgtH"', sh.tgtH, 0.1, 0.1, 100, '') + '<span class="unit">mm</span><button type="button" class="btn sm" data-act="fit">' + T('shFit') + '</button></span></div>';
      s += '<p class="note warn" id="shCapNote" hidden>' + T('shCap') + '</p></section>';
      s += '<section class="grp"><h2 class="grp-h">' + T('shStack') + '</h2><div id="shSum"></div><div id="shStack"></div></section>';
    }
    $('shLeft').innerHTML = s;
  }
  function drawStack(L) {
    var n = L.plies.length, W = 330, H = Math.max(120, Math.min(420, n * 14)), x0 = 46, bw = 150, s = '<svg class="stack" viewBox="0 0 ' + W + ' ' + (H + 26) + '" role="img" aria-label="' + esc(T('shStack')) + '">', y = 12, i;
    s += '<text class="tk" x="' + x0 + '" y="9">' + T('shTop') + '</text>';
    var lab = H / n >= 11;
    for (i = 0; i < n; i++) {
      var p = L.plies[i], ph = p.p.t / L.h * H;
      s += '<rect class="m-' + p.m + '" x="' + x0 + '" y="' + y.toFixed(2) + '" width="' + bw + '" height="' + Math.max(0.5, ph - (ph > 3 ? 0.8 : 0)).toFixed(2) + '"/>';
      if (lab) s += '<text class="tk" x="' + (x0 + bw + 8) + '" y="' + (y + ph / 2 + 4).toFixed(1) + '">' + p.a + '°</text><text class="tk" x="' + (x0 - 6) + '" y="' + (y + ph / 2 + 4).toFixed(1) + '" text-anchor="end">' + (i + 1) + '</text>';
      y += ph;
    }
    s += '<line class="dm" x1="' + (x0 + bw + 56) + '" x2="' + (x0 + bw + 56) + '" y1="12" y2="' + (12 + H) + '"/><text class="tk" x="' + (x0 + bw + 62) + '" y="' + (12 + H / 2 + 4) + '">' + f(L.h, 2) + ' mm</text>';
    return s + '</svg>';
  }
  function updateLeft(o) {
    var note = $('shMatNote');
    if (o.kind === 'plastic' || o.kind === 'rubber') { note.textContent = T(o.kind === 'plastic' ? 'matNotePlas' : 'matNoteRub'); return; }
    if (!o.lam) {
      var m = o.m;
      note.textContent = 'E ' + g(m.E / 1000, 4) + ' GPa, ' + T('shYield') + ' ' + g(o.sy, 4) + ' MPa' + (m.su ? ', ' + T('r_ts') + ' ' + m.su + ' MPa, ' + m.el + ' %' : '') + (api.st.mat === 'custom' ? '. ' + T('shCustomNote') : '');
      return;
    }
    note.textContent = T('matNoteLam');
    var L = o.L;
    MK.forEach(function (k) { var e = L.eff[k], c = $('vf_' + k); c.textContent = f(e.vf * 100, 1) + ' %'; c.className = 'nv' + (e.warn ? ' bad' : ''); });
    var chips = '<span class="chip ' + (L.symmetric ? 'ok' : 'warn') + '">' + T(L.symmetric ? 'shSymm' : 'shUnsym') + '</span> <span class="chip ' + (L.balanced ? 'ok' : 'warn') + '">' + T(L.balanced ? 'shBal' : 'shUnbal') + '</span>';
    $('shSum').innerHTML = '<p class="lm-code">' + esc(L.label) + '</p><p class="lm-h"><b>' + f(L.h, 3) + '</b> mm <span class="dimtx">' + T('shTotal') + ', ' + L.n + ' ' + T('lmPlies') + '</span></p><p>' + chips + '</p>';
    $('shStack').innerHTML = drawStack(L);
  }

  // ---------- 오른쪽: 결과 ----------
  function dataRows(o) {
    var rows = [], t = o.t, L = o.L;
    if (o.lam) {
      rows.push(['ts', 'MPa', t.tension.ult, 1, T('shFpf') + ' ' + g(t.tension.fpf, 4) + ' MPa (' + evTxt(t.tension.ev[0]) + ')']);
      rows.push(['te', 'GPa', L.Ex / 1000, 2, '']);
      rows.push(['cs', 'MPa', t.comp.ult, 1, T('shFpf') + ' ' + g(t.comp.fpf, 4) + ' MPa (' + evTxt(t.comp.ev[0]) + ')' + (t.comp.buckFirst ? '. ' + T('spBuck') : '')]);
      rows.push(['fs', 'MPa', t.flex.ult, 1, T('shFpf') + ' ' + g(t.flex.fpf, 4) + ' MPa (' + evTxt(t.flex.ev[0]) + ')' + (t.flex.shearFirst ? '. ' + T('shShearFirst') : '')]);
      rows.push(['fe', 'GPa', L.Ef / 1000, 2, '']);
      rows.push(['ilss', 'MPa', t.sbs, 1, T('shIlssIn'), 'in']);
      rows.push(['vn', 'MPa', t.vnotch.ult, 1, T('shG') + ' ' + g(L.Gxy / 1000, 3) + ' GPa, ' + T('shFpf') + ' ' + g(t.vnotch.fpf, 3) + ' MPa']);
      rows.push(['wf', 'wt%', L.wf * 100, 1, T('shVf') + ' ' + f(L.vf * 100, 1) + ' %']);
    } else if (o.kind === 'rubber') {
      Spec.RKEYS.forEach(function (k) { rows.push(['q_' + k[0], k[1], o.rb[k[0]], k[0] === 'rho' ? 2 : (k[0] === 'su' ? 1 : 0), '', 'in']); });
      rows.push(['q_m100', 'MPa', Spec.rubS(o.y, 'u', 2), 2, '']); rows.push(['q_G', 'MPa', o.G, 2, '†']); rows.push(['q_E', 'MPa', 3 * o.G, 2, '†']);
    } else if (o.kind === 'plastic') {
      Spec.PKEYS.forEach(function (k) { rows.push(['p_' + k[0], k[1], o.pl[k[0]], k[0] === 'E' || k[0] === 'Ef' || k[0] === 'rho' ? 2 : 1, '', 'in']); });
    } else {
      rows.push(['ts', 'MPa', o.m.su || null, 0, T('shYield') + ' ' + g(o.sy, 4) + ' MPa']);
      rows.push(['te', 'GPa', o.m.E / 1000, 1, '']);
    }
    return rows;
  }
  function rowName(k) { return k.indexOf('p_') === 0 ? T('pl_' + k.slice(2)) : k.indexOf('q_') === 0 ? T('rb_' + k.slice(2)) : T('r_' + k); }
  function panelSvg(lay) {
    var sc = Math.min(700 / lay.L, 340 / lay.W), W = lay.L * sc, H = lay.W * sc, s = '<svg class="panel-svg" viewBox="-4 -4 ' + (W + 8).toFixed(1) + ' ' + (H + 8).toFixed(1) + '" style="max-width:' + (W + 8).toFixed(0) + 'px" role="img" aria-label="' + esc(T('shPanel')) + '">';
    s += '<rect class="pn-b" x="0" y="0" width="' + W.toFixed(1) + '" height="' + H.toFixed(1) + '"/>';
    lay.rects.forEach(function (r) { s += '<path class="pc pc-' + r.key + '" d="' + Spec.outline(r.shape, r.x * sc, r.y * sc, sc) + '"/>'; });
    return s + '</svg>';
  }
  // 시편 그림
  function hd(x1, x2, y, txt, up) { // 가로 치수선
    return '<path class="dm" d="M' + x1 + ' ' + (y - 4) + 'V' + (y + 4) + 'M' + x2 + ' ' + (y - 4) + 'V' + (y + 4) + 'M' + x1 + ' ' + y + 'H' + x2 + '"/><text class="tk" x="' + ((x1 + x2) / 2) + '" y="' + (up ? y - 5 : y + 14) + '" text-anchor="middle">' + esc(txt) + '</text>';
  }
  function drawSpec(r, o) {
    var h = o.h, s = '', x0 = 30, y0, sh2 = r.shape, k, len, w, i;
    if (r.view === 'none') return '';
    if (r.view === 'bend') {
      k = Math.min(540 / sh2.len, 9); len = sh2.len * k; var th = Math.max(3, h * k), cx = x0 + 270, xa = cx - len / 2, sp = r.sup * k; y0 = 40;
      s += '<circle class="nose" cx="' + cx + '" cy="' + (y0 - 9) + '" r="8"/><rect class="sp" x="' + xa + '" y="' + y0 + '" width="' + len + '" height="' + th + '"/>';
      for (i = -1; i <= 1; i += 2) s += '<path class="nose" d="M' + (cx + i * sp / 2) + ' ' + (y0 + th) + 'l-8 14h16z"/>';
      s += hd(cx - sp / 2, cx + sp / 2, y0 + th + 24, T('shSupport') + ' ' + f(r.sup, 1)) + hd(xa, xa + len, y0 + th + 46, T('shLen') + ' ' + f(sh2.len, 1));
      s += '<text class="tk" x="' + x0 + '" y="14">' + T('shThick') + ' ' + f(h, 2) + ', ' + T('shWid') + ' ' + f(sh2.w, 2) + '</text>';
      return svgWrap(s, 630, y0 + th + 66);
    }
    k = Math.min(540 / sh2.len, 6); len = sh2.len * k; w = sh2.w * k; y0 = 34;
    s += '<path class="sp" d="' + Spec.outline(sh2, x0, y0, k) + '"/>';
    if (r.grip > 0 && sh2.type === 'rect') { var tb = r.grip * k, cl = r.tab ? 'tabz' : 'grip'; s += '<rect class="' + cl + '" x="' + x0 + '" y="' + y0 + '" width="' + tb + '" height="' + w + '"/><rect class="' + cl + '" x="' + (x0 + len - tb) + '" y="' + y0 + '" width="' + tb + '" height="' + w + '"/>'; }
    var gc = x0 + len / 2;
    if (r.gauge) {
      var gl = r.gauge * k, ins = sh2.type === 'dog' ? (sh2.w - sh2.W) / 2 * k : 0;
      s += '<path class="gm" d="M' + (gc - gl / 2) + ' ' + (y0 + ins) + 'V' + (y0 + w - ins) + 'M' + (gc + gl / 2) + ' ' + (y0 + ins) + 'V' + (y0 + w - ins) + '"/>' + hd(gc - gl / 2, gc + gl / 2, y0 - 10, T('shLg') + ' ' + r.gauge, true);
    }
    if (sh2.type === 'vn') s += '<path class="gm" d="M' + gc + ' ' + (y0 + sh2.d * k) + 'V' + (y0 + w - sh2.d * k) + '"/><text class="tk" x="' + (gc + 8) + '" y="' + (y0 + w / 2 + 4) + '">' + T('shNotchW') + ' ' + (sh2.w - 2 * sh2.d) + '</text>';
    if (sh2.type === 'izod') s += '<text class="tk" x="' + (gc + 10) + '" y="' + (y0 + w / 2 + 4) + '">' + T('spNotch') + ' ' + f(sh2.w - sh2.d, 2) + '</text>';
    s += hd(x0, x0 + len, y0 + w + 14, T('shLen') + ' ' + sh2.len) + '<text class="tk" x="' + (x0 + len + 6) + '" y="' + (y0 + w / 2 + 4) + '">' + (r.round ? 'Ø' : '') + sh2.w + (sh2.type === 'dog' ? ' / ' + (r.round ? 'Ø' : '') + sh2.W : '') + '</text>';
    return svgWrap(s, x0 + len + 80, y0 + w + 36);
  }
  function svgWrap(s, w, h) { return '<svg class="spec-svg" viewBox="0 0 ' + w + ' ' + h + '" style="max-width:' + w + 'px" role="img">' + s + '</svg>'; }

  function buildMain(o) {
    var s = '<div class="sh-grid' + (o.lam ? '' : ' metal') + '">', rows = dataRows(o), tens = sh.test === 'tension' || sh.test === 'e8' || sh.test === 'ptension' || sh.test === 'rtension';
    s += '<section class="card c-data"><h2>' + T('shData') + ' <span class="sub">' + esc(o.lam ? o.L.label + ', ' + f(o.h, 2) + ' mm, ' + o.L.n + ' ' + T('lmPlies') : o.m.name + ', ' + f(o.h, 2) + ' mm') + '</span></h2>';
    if (o.kind === 'plastic' || o.kind === 'rubber') s += '<p class="note warn notice">' + T(o.kind === 'plastic' ? 'plNotice' : 'rbNotice') + ' ' + T(o.kind === 'plastic' ? 'odPlasNote' : 'odRubNote') + (o.mat === 'PL_PEEK' ? ' ' + T('odPeek') : '') + '</p>';
    s += '<div class="tw"><table class="ds"><thead><tr><th>' + T('shItem') + '</th><th>' + T('shUnit') + '</th><th>' + T('shTarget') + '</th><th>' + T(o.kind === 'plastic' || o.kind === 'rubber' ? 'vIn' : 'shPred') + '</th><th>' + T('shVerdict') + '</th><th>' + T('shStd') + '</th><th>' + T('shRemark') + '</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var tg = sh.tg[r[0]] || 0, v = r[2], pass = v !== null && v >= tg * (1 - 1e-9), chip;
      if (v === null) chip = '<span class="dimtx">' + T('vNa') + '</span>';
      else if (!(tg > 0)) chip = '<span class="dimtx">–</span>';
      else chip = '<span class="chip ' + (pass ? 'ok' : 'bad') + '">' + T(pass ? 'vOk' : 'vNg') + '</span>' + (r[5] && o.lam ? ' <span class="chip warn">' + T('vIn') + '</span>' : '');
      s += '<tr><th scope="row">' + rowName(r[0]) + '</th><td>' + r[1] + '</td><td>' + numIn('data-tg="' + r[0] + '" aria-label="' + esc(rowName(r[0]) + ' ' + T('shTarget')) + '"', tg, 'any', 0, 100000) + '</td><td class="nv big">' + (v === null ? '–' : f(v, r[3])) + (v !== null && tg > 0 ? ' <small>×' + f(v / tg, 2) + '</small>' : '') + '</td><td>' + chip + '</td><td>' + (STD[r[0]] || '') + '</td><td class="rem">' + esc(r[4]) + '</td></tr>';
    });
    s += '</tbody></table></div>';
    if (o.lam) {
      s += '<p class="more">' + T('shMore') + ' ' + f(o.L.nuxy, 3) + ' · ' + T('shRho') + ' ' + f(o.L.rho, 3) + ' g/cm³ · ' + T('shAreal') + ' ' + f(o.L.areal, 0) + ' g/m²</p>';
      if (!o.L.symmetric || !o.L.balanced) s += '<p class="note warn">' + T('shNotBal') + '</p>';
      if (o.L.warn.length) s += '<p class="note warn">' + T('vfWarn') + '</p>';
      s += '<p class="note">' + T('shPredNote') + '</p>';
    }
    s += '</section><section class="card c-curve"><h2>' + T('shCurve') + '</h2><div class="cbar">';
    if (o.tests.length > 1) {
      s += '<label>' + T('shTest') + ' <select data-sh="test">';
      o.tests.forEach(function (k) { s += '<option value="' + k + '"' + (sh.test === k ? ' selected' : '') + '>' + testName(k) + '</option>'; });
      s += '</select></label>';
    }
    if (tens) {
      s += '<label>' + T('shXmode') + ' <select data-sh="xmode"><option value="gauge"' + (sh.xmode === 'gauge' ? ' selected' : '') + '>' + T('xGauge') + '</option><option value="grip"' + (sh.xmode === 'grip' ? ' selected' : '') + '>' + T('xGrip') + '</option></select></label>';
      if (sh.test !== 'ptension' && sh.test !== 'rtension') s += '<label>' + T('shLg') + ' ' + numIn('data-sh="Lg"', sh.Lg, 1, 10, 200) + ' mm</label>';
      if (o.lam) {
        s += '<label>' + T('shCmp') + ' <select data-sh="cmp"><option value="none">' + T('shNone') + '</option>';
        ['SS400', 'S235', 'STS304', 'AL6061'].forEach(function (k) { s += '<option value="' + k + '"' + (sh.cmp === k ? ' selected' : '') + '>' + k + '</option>'; });
        s += '</select></label>';
      }
    }
    s += '</div><div id="shChart"></div><div class="cur"><label for="shCur">' + T('shDisp') + '</label><input type="range" id="shCur" min="0" max="1000" step="1" value="' + Math.round(sh.cur * 1000) + '"><output id="shRead" for="shCur"></output></div><p class="note" id="shCurveNote"></p><div id="shGl"></div></section>';
    if (o.lam) s += '<section class="card c-ply"><h2>' + T('shPly') + '</h2><div id="shPly"></div></section>';
    // 시편
    s += '<section class="card c-spec"><h2>' + T('shSpec') + ' <span class="sub">' + T('shScale') + '</span></h2><div class="cbar">';
    s += '<label>' + T('spGap') + ' ' + numIn('data-sh="kerf"', sh.kerf, 0.5, 0, 20) + ' mm</label><label>' + T('shMargin') + ' ' + numIn('data-sh="margin"', sh.margin, 1, 0, 50) + ' mm</label><label>' + T('spPlen') + ' ' + numIn('data-sh="plen"', sh.plen, 10, 0, 3000) + ' mm</label>';
    if (o.lam) {
      s += '<label>' + T('shRatio') + ' <select data-sh="ratio">'; [16, 20, 32, 40, 60].forEach(function (k) { s += '<option value="' + k + '"' + (sh.ratio === k ? ' selected' : '') + '>' + k + ':1</option>'; }); s += '</select></label>';
      s += '<label>' + T('spCstd') + ' <select data-sh="cstd">'; ['D6641', 'D3410', 'D695'].forEach(function (k) { s += '<option value="' + k + '"' + (sh.cstd === k ? ' selected' : '') + '>ASTM ' + k + '</option>'; }); s += '</select></label>';
    }
    if (o.kind === 'metal') {
      s += '<label>' + T('spForm') + ' <select data-sh="mform"><option value="flat"' + (sh.mform === 'flat' ? ' selected' : '') + '>' + T('spFlat') + '</option><option value="round"' + (sh.mform === 'round' ? ' selected' : '') + '>' + T('spRound') + '</option></select></label>';
      if (sh.mform === 'round') { s += '<label>' + T('spRdSel') + ' <select data-sh="mround">'; Object.keys(Spec.ROUND).forEach(function (k) { var q = Spec.ROUND[k]; s += '<option value="' + k + '"' + (sh.mround === k ? ' selected' : '') + '>' + q.std + ' ' + q.name + '</option>'; }); s += '</select></label>'; }
    }
    if (o.kind === 'rubber') { s += '<label>' + T('spRstd') + ' <select data-sh="rstd"><option value="ASTM"' + (sh.rstd === 'ASTM' ? ' selected' : '') + '>ASTM</option><option value="KS"' + (sh.rstd === 'KS' ? ' selected' : '') + '>KS·ISO †</option></select></label>'; }
    if (o.kind === 'plastic') { s += '<label>D638 ' + T('spType') + ' <select data-sh="d638">'; ['auto', 'I', 'II', 'III', 'IV', 'V'].forEach(function (k) { s += '<option value="' + k + '"' + (sh.d638 === k ? ' selected' : '') + '>' + (k === 'auto' ? T('spAuto') : k) + '</option>'; }); s += '</select></label>'; }
    s += '</div><div class="tw"><table class="ds spec"><thead><tr><th>' + T('shTest') + '</th><th>' + T('shSize') + '</th><th>' + T('shSpan') + '</th><th>' + T('shRate') + '</th><th>' + T('shPf') + '</th><th>' + T('shQty') + '</th><th>' + T('shRemark') + '</th></tr></thead><tbody>';
    o.all.forEach(function (r) {
      var nm = r.name || T('t_' + r.key);
      s += '<tr' + (r.n > 0 ? '' : ' class="off"') + '><th scope="row"><label><input type="checkbox" data-inc="' + r.key + '"' + (r.n > 0 ? ' checked' : '') + '> <i class="sw pc-' + r.key + '"></i>' + nm + '</label></th><td>' + r.size + '</td><td>' + r.span + '</td><td>' + r.rate + '</td><td class="nv">' + (r.P === null ? (r.energy !== undefined ? f(r.energy, 2) + ' J' : '–') : (r.P >= 10000 ? f(r.P / 1000, 1) + ' kN' : f(r.P, 0) + ' N')) + '</td><td>' + numIn('data-q="' + r.key + '" aria-label="' + esc(nm + ' ' + T('shQty')) + '"', r.n > 0 ? r.n : (sh.q[r.key] === undefined ? (r.n0 || 7) : sh.q[r.key]), 1, 0, 50) + '</td><td class="rem">' + esc(r.rem) + '</td></tr>';
    });
    s += '</tbody></table></div><p class="note">' + T('shMem') + '</p><div class="specs">';
    o.rows.forEach(function (r) { if (r.view !== 'none') s += '<figure><figcaption>' + (r.name || T('t_' + r.key)) + '</figcaption>' + drawSpec(r, o) + '</figure>'; });
    s += '</div>';
    if (o.rows.length) s += '<p class="gofab"><b>' + T('shPanel') + ' ' + f(Math.ceil(o.lay.L), 0) + ' × ' + f(Math.ceil(o.lay.W), 0) + ' × ' + f(o.h, 2) + ' mm</b> <button type="button" class="btn big solid" data-go="fab">' + T('fbGo') + '</button></p>';
    s += '</section></div>';
    $('shMain').innerHTML = s;
  }
  function buildFab(o) {
    var s = '<div class="fab-grid"><section class="card c-lay"><h2>' + T('fbLay') + ' <span class="sub">' + esc((o.lam ? o.L.label : o.m.name) + ', ' + f(o.h, 2) + ' mm') + '</span></h2><div class="cbar">';
    s += '<label>' + T('spGap') + ' ' + numIn('data-sh="kerf"', sh.kerf, 0.5, 0, 20) + ' mm</label><label>' + T('shMargin') + ' ' + numIn('data-sh="margin"', sh.margin, 1, 0, 50) + ' mm</label><label>' + T('spPlen') + ' ' + numIn('data-sh="plen"', sh.plen, 10, 0, 3000) + ' mm</label></div>';
    s += '<div class="tw"><table class="ds spec"><thead><tr><th>' + T('shTest') + '</th><th>' + T('shSize') + '</th><th>' + T('shQty') + '</th></tr></thead><tbody>';
    o.all.forEach(function (r) {
      var nm = r.name || T('t_' + r.key);
      s += '<tr' + (r.n > 0 ? '' : ' class="off"') + '><th scope="row"><label><input type="checkbox" data-inc="' + r.key + '"' + (r.n > 0 ? ' checked' : '') + '> <i class="sw pc-' + r.key + '"></i>' + nm + '</label></th><td>' + r.size + '</td><td>' + numIn('data-q="' + r.key + '" aria-label="' + esc(nm + ' ' + T('shQty')) + '"', r.n > 0 ? r.n : (sh.q[r.key] === undefined ? (r.n0 || 7) : sh.q[r.key]), 1, 0, 50) + '</td></tr>';
    });
    s += '</tbody></table></div>';
    if (o.rows.length && !o.lay.rects.length) s += '<p class="note warn notice">' + T('spRoundNote') + '</p>';
    else if (o.rows.length) s += '<h3>' + T('shPanel') + ' <b>' + f(Math.ceil(o.lay.L), 0) + ' × ' + f(Math.ceil(o.lay.W), 0) + ' × ' + f(o.h, 2) + ' mm</b></h3>' + panelSvg(o.lay) + '<p class="note' + (o.lay.short ? ' warn' : '') + '">' + T(o.lay.short ? 'spTooLong' : 'shPanelNote') + '</p>';
    s += '</section><div class="fab-side"><section class="card"><h2>' + T('fbDraw') + '</h2><p class="note">' + T('fbDrawNote') + '</p><div class="bigrow">';
    [['cut.svg', 'fbCutSvg'], ['cut.dxf', 'fbCutDxf'], ['draw.svg', 'fbDrSvg'], ['draw.dxf', 'fbDrDxf']].forEach(function (b) { s += '<button type="button" class="btn big" data-ex="' + b[0] + '"' + (o.rows.length && (o.lay.rects.length || b[0].indexOf('draw') === 0) ? '' : ' disabled') + '>' + T(b[1]) + '</button>'; });
    s += '</div></section><section class="card"><h2>' + T('fbMach') + '</h2><ul class="mach"><li><b>' + T('fbM1') + '</b> <span class="chip ok">' + T('fbSim') + '</span></li><li>' + T('fbM2') + ' <span class="chip">' + T('fbFmt') + '</span></li><li>' + T('fbM3') + ' <span class="chip">' + T('fbFmt') + '</span></li></ul><p class="note">' + T('fbMachNote') + '</p></section></div></div>';
    $('fabTop').innerHTML = s; Order.render(o); ensureCam();
    if (o.rows.length && !o.lay.rects.length) { sent = null; noLay = true; $('fabMsg').textContent = T('spRoundNote'); }
    else if (noLay) { noLay = false; $('fabMsg').textContent = ''; sendCam(true); }
  }
  function onFabClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-ex]') : null; if (!b || !R) return;
    var k = b.getAttribute('data-ex'), ttl = T('title') + ' ' + (R.lam ? R.L.label : R.m.name) + ' ' + f(R.h, 2) + ' mm', cut = Spec.cutDoc(R.lay, true);
    if (k === 'cut.svg') api.saveFile('coupon-cut.svg', Spec.cutSvg(R.lay, ttl), 'image/svg+xml', T('fbCutSvg'));
    else if (k === 'cut.dxf') api.saveFile('coupon-cut.dxf', Spec.toDxf(cut), 'application/dxf', T('fbCutDxf'));
    else if (k === 'draw.svg') api.saveFile('coupon-drawing.svg', Spec.toSvg(Spec.drawDoc(R.rows, +R.h.toFixed(3)), ttl), 'image/svg+xml', T('fbDrSvg'));
    else if (k === 'draw.dxf') api.saveFile('coupon-drawing.dxf', Spec.toDxf(Spec.drawDoc(R.rows, +R.h.toFixed(3))), 'application/dxf', T('fbDrDxf'));
  }
  // ---------- 시편 CAM (대표가 만든 RichAuto 시편 CAM을 그대로 끼워 씀) ----------
  var camFrame = null, camReady = false;
  function ensureCam() {
    if (camFrame) return;
    var url = window.SITE && window.SITE.cam;
    $('camVer').textContent = 'RichAuto CAM ' + CAM_VER;
    camFrame = document.createElement('iframe'); camFrame.className = 'cam-frame'; camFrame.title = 'RichAuto CAM';
    camFrame.addEventListener('load', function () { camReady = true; camLang(api.st.lang); sendCam(true); });
    if (url) camFrame.src = url; else camFrame.srcdoc = CAM_HTML;
    $('camWrap').appendChild(camFrame);
    $('camSend').addEventListener('click', function () { sendCam(false); });
    $('camPop').addEventListener('click', function () {
      try { var w = window.open(window.SITE && window.SITE.cam ? window.SITE.cam : URL.createObjectURL(new Blob([CAM_HTML], { type: 'text/html' })), '_blank'); $('fabMsg').textContent = T(w ? 'fbPopOk' : 'fbPopNo'); } catch (e) { $('fabMsg').textContent = T('fbPopNo'); }
    });
  }
  var sent = null, noLay = false;
  function sentMsg() { if (sent) $('fabMsg').textContent = (sent.key ? '' : T('fbNoMat') + ' ') + T('fbSent') + ' ' + sent.n + ' ' + T('shPcs') + ', ' + sent.L + ' × ' + sent.W + ' × ' + f(sent.h, 2) + ' mm'; }
  function camLang(l) {
    if (!camFrame || !camReady) return;
    if (noLay) $('fabMsg').textContent = T('spRoundNote'); else sentMsg();
    try { var w = camFrame.contentWindow, m = l === 'ko' ? 'ko' : 'en', s = w.document.getElementById('langSel'); if (s) s.value = m; if (w.camLang) w.camLang(m); } catch (e) { /* 다른 출처 */ }
  }
  function sendCam(auto) {
    var msg = $('fabMsg');
    if (R && R.rows.length && !R.lay.rects.length) { sent = null; noLay = true; msg.textContent = T('spRoundNote'); return; }
    noLay = false;
    if (!camReady || !R || !R.rows.length) { if (!auto) msg.textContent = T('fbSendFail'); return; }
    try {
      var w = camFrame.contentWindow, d = w.document, fire = function (e, t) { e.dispatchEvent(new w.Event(t, { bubbles: true })); }; // eslint-disable-line
      var mk = api.st.mat, key = R.lam ? (R.L.plies.some(function (p) { return p.m.indexOf('cf') === 0; }) ? 'cfrp' : 'gfrp') : R.kind === 'plastic' ? (mk === 'PL_PP' ? 'pp' : 'pc') : (mk === 'AL6061' ? 'al' : ''), ms = d.getElementById('mat');
      if (ms && key && ms.value !== key) { ms.value = key; if (ms.value === key) fire(ms, 'change'); }
      var te = d.getElementById('T'); if (te) { te.value = +R.h.toFixed(2); fire(te, 'input'); fire(te, 'change'); }
      var ttl = T('title') + ' ' + (R.lam ? R.L.label : R.m.name), svg = Spec.cutSvg(R.lay, ttl), inp = d.getElementById('svgfile'), dt = new w.DataTransfer();
      dt.items.add(new w.File([svg], 'coupon-cut_' + Math.ceil(R.lay.L) + 'x' + Math.ceil(R.lay.W) + '_T' + (+R.h.toFixed(2)) + '.svg', { type: 'image/svg+xml' }));
      inp.files = dt.files; fire(inp, 'change');
      sent = { key: key, n: R.lay.rects.length, L: Math.ceil(R.lay.L), W: Math.ceil(R.lay.W), h: R.h }; sentMsg();
    } catch (e) { msg.textContent = T('fbSendFail'); }
  }
  function drawCurve() {
    var o = R, c = curve(o, sh.test), xend = c.pts[c.pts.length - 1][0], x = sh.cur * xend, q = at(c.pts, x), tens = sh.test === 'tension' || sh.test === 'e8' || sh.test === 'ptension';
    $('shChart').innerHTML = chartSvg(c, x);
    var vn = sh.test === 'vnotch';
    $('shRead').textContent = (vn ? T('shShearStrain') + ' ' + f(q[0], 3) + ' %' : f(q[0], 3) + ' mm') + ' → ' + T('shLoad') + ' ' + (q[1] >= 10000 ? f(q[1] / 1000, 2) + ' kN' : f(q[1], 0) + ' N') + ', ' + T('shStress') + ' ' + f(q[2], 1) + ' MPa' + (vn || sh.test === 'ilss' ? '' : ', ' + T('shStrain') + ' ' + f(q[3] * 100, 3) + ' %');
    $('shCurveNote').textContent = c.note; $('shCurveNote').hidden = !c.note;
    var gl = '';
    if (tens) {
      var Ls = [25, 50, 100], cols; if (Ls.indexOf(sh.Lg) < 0) Ls.push(sh.Lg);
      if (o.lam) { Ls.push(-o.sp.tension.grip); cols = [[T('shGlMod'), 0.002], [T('shGlFpf'), o.t.tension.fpfE], [T('shGlUlt'), o.t.tension.ultE]]; }
      else if (o.kind === 'rubber') { Ls = [o.d.ten.G, -o.d.ten.A]; cols = [['100 %', 1], ['300 %', 3], [T('shGlUlt'), o.rb.el / 100]]; }
      else if (o.kind === 'plastic') { Ls = [o.d.g.G, -o.d.g.D]; cols = [[T('shGlY'), o.pl.su / (o.pl.E * 1000)], [T('shGlUlt'), o.pl.el / 100]]; }
      else { Ls.push(-100); cols = [[T('shGlY'), o.sy / o.m.E], [T('shGlUlt'), o.el / 100]]; }
      gl = '<h3>' + T('shGlT') + ' <span class="sub">mm</span></h3><div class="tw"><table class="ds gl"><thead><tr><th>' + T('shLg') + '</th>' + cols.map(function (k) { return '<th>' + k[0] + '</th>'; }).join('') + '</tr></thead><tbody>';
      Ls.forEach(function (Lg) { gl += '<tr><th scope="row">' + (Lg < 0 ? T('xGrip') + ' ' + (-Lg) : Lg) + ' mm</th>' + cols.map(function (k) { return '<td class="nv">' + f(k[1] * Math.abs(Lg), 3) + '</td>'; }).join('') + '</tr>'; });
      gl += '</tbody></table></div>';
    }
    $('shGl').innerHTML = gl;
    if (o.lam) drawPly(q);
  }
  function drawPly(q) {
    var o = R, L = o.L, h = L.h, n = L.plies.length, W = 300, H = Math.max(140, Math.min(440, n * 14)), x0 = 40, bw = 200, s, i, y = 14;
    if (sh.test === 'ilss') {
      var il = o.t.il, k = 1 / il.rmax, tm = il.tmax * k;
      s = '<svg class="stack" viewBox="0 0 ' + W + ' ' + (H + 40) + '" role="img"><rect class="fr" x="' + x0 + '" y="14" width="' + bw + '" height="' + H + '"/>';
      var pth = ''; for (i = 0; i < il.z.length; i++) pth += (i ? 'L' : 'M') + (x0 + il.tau[i] * k / tm * bw * 0.92).toFixed(1) + ' ' + (14 + (h / 2 - il.z[i]) / h * H).toFixed(1);
      s += '<path class="cv" d="' + pth + '"/><text class="tk" x="' + (x0 + bw) + '" y="' + (H + 30) + '" text-anchor="end">' + f(tm, 1) + ' MPa</text><text class="tk" x="' + x0 + '" y="' + (H + 30) + '">0</text></svg>';
      $('shPly').innerHTML = s + '<p class="note">' + T('shTauNote') + '</p>'; return;
    }
    var st = q[2], load = sh.test === 'tension' ? [st * h, 0, 0, 0, 0, 0] : sh.test === 'comp' ? [-st * h, 0, 0, 0, 0, 0] : sh.test === 'flex' ? [0, 0, 0, st * h * h / 6, 0, 0] : [0, 0, st * h, 0, 0, 0];
    var ps = Lam.plyState(L, load), lab = H / n >= 11;
    s = '<svg class="stack" viewBox="0 0 ' + W + ' ' + (H + 40) + '" role="img" aria-label="' + esc(T('shPly')) + '"><line class="gm" x1="' + (x0 + bw) + '" x2="' + (x0 + bw) + '" y1="10" y2="' + (H + 18) + '"/>';
    for (i = 0; i < n; i++) {
      var a = ps.list[2 * i], b = ps.list[2 * i + 1], u = Math.max(a.raw[0], a.raw[1], a.raw[2], b.raw[0], b.raw[1], b.raw[2]), ph = L.plies[i].p.t / h * H;
      s += '<rect x="' + x0 + '" y="' + y.toFixed(2) + '" width="' + (Math.min(u, 1.12) * bw).toFixed(1) + '" height="' + Math.max(0.6, ph - (ph > 3 ? 0.8 : 0)).toFixed(2) + '" fill="' + hue(u) + '"/>';
      if (lab) s += '<text class="tk" x="' + (x0 - 5) + '" y="' + (y + ph / 2 + 4).toFixed(1) + '" text-anchor="end">' + L.plies[i].a + '°</text><text class="tk" x="' + (x0 + Math.min(u, 1.12) * bw + 5).toFixed(1) + '" y="' + (y + ph / 2 + 4).toFixed(1) + '">' + f(u, 2) + '</text>';
      y += ph;
    }
    s += '<text class="tk" x="' + x0 + '" y="' + (H + 32) + '">0</text><text class="tk" x="' + (x0 + bw) + '" y="' + (H + 32) + '" text-anchor="middle">1</text></svg>';
    $('shPly').innerHTML = s + '<p class="note">' + T('shPlyNote') + '</p>';
  }

  // ---------- 그리기 ----------
  var busy = false, pend = null;
  function settle(host) { var a = document.activeElement; if (a && a !== document.body && host.contains(a) && a.tagName === 'INPUT' && a.type === 'number') a.blur(); }
  function render(full) {
    if (!api || (api.st.tab !== 'sheet' && api.st.tab !== 'fab')) return;
    if (api.st.tab === 'fab') { settle($('fab')); R = compute(); buildFab(R); return; }
    if (busy) { pend = pend || !!full; return; }   // 다시 그리는 도중의 입력 확정은 끝난 뒤 한 번 더 그림
    busy = true;
    try {
      var mode = api.st.mat;
      if (full || mode !== lastMode) {
        var act = document.activeElement, refocus = act && act.id === 'sh_mat';
        settle($('shLeft')); buildLeft(); lastMode = mode;
        if (refocus) $('sh_mat').focus();
      }
      settle($('shMain'));
      R = compute();
      updateLeft(R); buildMain(R); drawCurve();
    } finally { busy = false; }
    if (pend !== null) { var f2 = pend; pend = null; render(f2); }
  }
  function capPlies() {
    var cfg = api.cfg(), base = 0, cap = false; cfg.lam.plies.forEach(function (q) { base += Math.max(1, Math.round(q.n || 1)); }); base *= cfg.lam.sym ? 2 : 1;
    while (cfg.lam.rep > 1 && base * cfg.lam.rep > 400) { cfg.lam.rep--; cap = true; }
    return cap;
  }
  function changed(full) {
    var cap = capPlies();
    if (full || cap) lastMode = null;
    api.changed();
    var cn = $('shCapNote'); if (cn) cn.hidden = !cap;
  }
  function onLeft(ev) {
    var e = ev.target, cfg = api.cfg(), a, fin = ev.type === 'change';
    if (e.getAttribute('data-k')) return;
    if ((a = e.getAttribute('data-lm'))) {
      var kp = a.split('.'), v = parseFloat(e.value);
      if (!(v > 0)) return;
      if (kp[1] === 't') v = clampN(v, 0.02, 2, 0.15);
      if (kp[1] === 'nu12') v = Math.min(v, 0.49);
      if (kp[1] === 'vf0') v = clampN(v, 0.2, 0.8, 0.6);
      cfg.mats[kp[0]][kp[1]] = v; if (fin) e.value = v; changed(false);
    } else if ((a = e.getAttribute('data-lr'))) { var r = parseFloat(e.value); if (r > 0) { cfg.resin[a] = r; changed(false); } }
    else if (e.getAttribute('data-lc')) { cfg.corr = e.checked; changed(false); }
    else if ((a = e.getAttribute('data-rb'))) { var rv = parseFloat(e.value); if (rv > 0) api.setRub(api.st.mat, a, rv); }
    else if ((a = e.getAttribute('data-pl'))) { var pv = parseFloat(e.value); if (pv > 0) api.setPlas(api.st.mat, a, pv); }
    else if ((a = e.getAttribute('data-pn')) !== null) { var pn = Math.round(clampN(e.value, 1, 60, NaN)); if (isFinite(pn)) { cfg.lam.plies[+a].n = pn; if (fin) e.value = pn; changed(false); } }
    else if ((a = e.getAttribute('data-pm')) !== null) { cfg.lam.plies[+a].m = e.value; changed(false); }
    else if ((a = e.getAttribute('data-pa')) !== null) { var an = Math.round(clampN(e.value, -90, 90, NaN)); if (isFinite(an)) { cfg.lam.plies[+a].a = an; if (fin) e.value = an; changed(false); } }
    else if ((a = e.getAttribute('data-ll'))) {
      if (a === 'sym') cfg.lam.sym = e.checked; else { var rp = Math.round(clampN(e.value, 1, 20, NaN)); if (!isFinite(rp)) return; cfg.lam.rep = rp; if (fin) e.value = rp; }
      changed(false); if (fin && a === 'rep') e.value = cfg.lam.rep;
    } else if ((a = e.getAttribute('data-sh'))) {
      if (a === 'mt') { sh.mt = clampN(e.value, 0.3, 50, sh.mt); render(false); } else if (a === 'tgtH') sh.tgtH = clampN(e.value, 0.1, 100, sh.tgtH);
    } else if (e.getAttribute('data-act') === 'preset' && fin && e.value) { cfg.lam = Lam.preset(e.value); changed(true); }
  }
  function onLeftClick(ev) {
    var e = ev.target.closest ? ev.target.closest('button') : null, cfg = api.cfg(), a, i, p;
    if (!e) return;
    if ((a = e.getAttribute('data-cat'))) { if (a !== catOf(api.st.mat)) { api.setMat(lastIn[a] || CATS[a][0]); var nb = document.querySelector('[data-cat="' + a + '"]'); if (nb) nb.focus(); } return; }
    p = cfg.lam.plies;
    if ((a = e.getAttribute('data-open'))) { sh.open[a] = !sh.open[a]; $('lmd_' + a).hidden = !sh.open[a]; e.setAttribute('aria-expanded', sh.open[a] ? 'true' : 'false'); return; }
    if ((a = e.getAttribute('data-up')) !== null) { i = +a; p.splice(i - 1, 0, p.splice(i, 1)[0]); changed(true); focusBtn('data-up', Math.max(0, i - 1)); return; }
    if ((a = e.getAttribute('data-dn')) !== null) { i = +a; p.splice(i + 1, 0, p.splice(i, 1)[0]); changed(true); focusBtn('data-dn', Math.min(p.length - 1, i + 1)); return; }
    if ((a = e.getAttribute('data-rm')) !== null) { p.splice(+a, 1); changed(true); return; }
    a = e.getAttribute('data-act');
    if (a === 'add') { p.push({ m: p[p.length - 1].m, a: p[p.length - 1].a, n: 1 }); changed(true); focusBtn('data-pa', p.length - 1); }
    else if (a === 'fit') {
      var eff = {}, base = 0; MK.forEach(function (k) { eff[k] = cfg.mats[k].t; }); p.forEach(function (q) { base += eff[q.m] * Math.max(1, Math.round(q.n || 1)); });
      cfg.lam.rep = Math.max(1, Math.min(20, Math.round(sh.tgtH / (base * (cfg.lam.sym ? 2 : 1))))); changed(true);
    } else if (a === 'resetMats') { var d = Lam.defaults(); cfg.mats = d.mats; cfg.resin = d.resin; cfg.corr = true; changed(true); }
  }
  function focusBtn(attr, i) { var b = $('shLeft').querySelector('[' + attr + '="' + i + '"]'); if (b && !b.disabled) b.focus(); }
  function onMain(ev) {
    var e = ev.target, a, fin = ev.type === 'change';
    if (e.id === 'shCur') { sh.cur = e.value / 1000; drawCurve(); return; }
    if (!fin) return;
    if ((a = e.getAttribute('data-tg'))) { var v = parseFloat(e.value); if (v >= 0) sh.tg[a] = v; render(false); }
    else if ((a = e.getAttribute('data-inc'))) { sh.inc[a] = e.checked; render(false); }
    else if ((a = e.getAttribute('data-q'))) { sh.q[a] = Math.round(clampN(e.value, 0, 50, 7)); if (sh.q[a] > 0) sh.inc[a] = true; render(false); }
    else if ((a = e.getAttribute('data-sh'))) {
      if (a === 'test' || a === 'xmode' || a === 'cmp' || a === 'cstd' || a === 'd638' || a === 'rstd' || a === 'mform' || a === 'mround') { sh[a] = e.value; if (a === 'test') sh.cur = 1; }
      else if (a === 'ratio') sh.ratio = +e.value;
      else { var lim = { Lg: [10, 200], kerf: [0, 20], margin: [0, 50], plen: [0, 3000] }[a]; sh[a] = clampN(e.value, lim[0], lim[1], sh[a]); }
      render(false);
    }
  }
  function onMainClick(ev) {
    var b = ev.target.closest ? ev.target.closest('[data-go]') : null;
    if (b) api.goTab(b.getAttribute('data-go'));
  }
  function csv() {
    var o = R || compute(), out = [], q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, row = function () { out.push(Array.prototype.map.call(arguments, q).join(',')); }; // eslint-disable-line
    R = o;
    row(T('shData'), o.lam ? o.L.label : o.m.name); row(T('shTotal') + ' (mm)', o.h);
    row(T('shItem'), T('shUnit'), T('shTarget'), T('shPred'), T('shStd'), T('shRemark'));
    dataRows(o).forEach(function (r) { row(rowName(r[0]), r[1], sh.tg[r[0]] || '', r[2] === null ? '' : +r[2].toFixed(4), STD[r[0]] || '', r[4]); });
    if (o.lam) {
      out.push(''); row(T('shLayup'), '#', T('shMat'), '°', T('shThk') + ' (mm)');
      o.L.plies.forEach(function (p, i) { row('', i + 1, T('m_' + p.m), p.a, p.p.t); });
      out.push(''); row(T('shPlyMats'), 't', 'FAW', 'Vf', 'E1', 'E2', 'G12', 'nu12', 'Xt', 'Xc', 'Yt', 'Yc', 'S12', 'S13');
      MK.forEach(function (k) { var e = o.L.eff[k]; row(T('m_' + k), e.t, e.faw, +e.vf.toFixed(4), +e.E1.toFixed(1), +e.E2.toFixed(1), +e.G12.toFixed(1), e.nu12, +e.Xt.toFixed(1), +e.Xc.toFixed(1), +e.Yt.toFixed(1), +e.Yc.toFixed(1), e.S12, e.S13); });
    }
    out.push(''); row(T('shSpec'), T('shStd'), T('shSize'), T('shSpan'), T('shRate'), T('shPf') + ' (N)', T('shQty'), T('shRemark'));
    o.rows.forEach(function (r) { row(r.name || T('t_' + r.key), r.std, r.size, r.span, r.rate, r.P === null ? '' : +r.P.toFixed(1), r.n, r.rem); });
    row(T('shPanel') + ' (mm)', Math.ceil(o.lay.L) + ' x ' + Math.ceil(o.lay.W) + ' x ' + o.h);
    var c = curve(o, sh.test); out.push(''); row(T('shCurve'), testName(sh.test)); row(c.xl, T('shLoad') + ' (N)', c.sl);
    c.pts.forEach(function (p) { row(+p[0].toFixed(5), +p[1].toFixed(2), +p[2].toFixed(3)); });
    return out.join('\n');
  }

  function init(a) {
    api = a; $ = a.$;
    var l = $('shLeft'), m = $('shMain');
    l.addEventListener('input', onLeft); l.addEventListener('change', onLeft); l.addEventListener('click', onLeftClick);
    m.addEventListener('input', onMain); m.addEventListener('change', onMain); m.addEventListener('click', onMainClick);
    var fb = $('fab'); fb.addEventListener('change', onMain); fb.addEventListener('click', onFabClick);
  }
  return { camLang: camLang, init: init, render: render, csv: csv, state: sh, result: function () { return R; }, model: function () { var o = compute(); return { o: o, curve: function (t) { return curve(o, t); }, at: at, name: testName, hue: hue }; } };
})();

/* motion.js: 시험 모션 탭. 치구와 시편을 옆에서 본 그림을 변위에 맞춰 움직임 (변형은 과장) */
Object.assign(I18N, {
  tabMotion: ['시험 모션', 'Test motion'], moPlay: ['재생', 'Play'], moPause: ['멈춤', 'Pause'], moReset: ['처음으로', 'Restart'], moSpeed: ['속도', 'Speed'],
  moProg: ['진행', 'Progress'], moNote: ['변형과 움직임은 과장해 그렸습니다. 색은 사용률(하중 ÷ 파단 하중)입니다.', 'Deformation and travel are exaggerated. Colour shows utilisation (load ÷ failure load).'],
  moRun: ['하중 증가', 'Loading'], moFpf: ['첫 층 파손 지남', 'Past first-ply failure'], moYield: ['항복 지남', 'Past yield'], moBroken: ['파단', 'Failed'],
  moRise: ['오름 각', 'Rise angle'], moHit: ['타격 전', 'Before impact'], moEdit: ['재질·적층은 물성 시트 탭에서 고칩니다.', 'Edit material and layup on the Material sheet tab.'],
  moUtil: ['사용률', 'Utilisation']
});

var Motion = (function () {
  'use strict';
  var T = U.T, f = U.fix, api, $, M = null, cards = [], st = { p: 0.8, play: false, speed: 1, hold: 0 }, raf = 0, last = 0, sig = '';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function hue(t) { t = Math.max(0, Math.min(1, t)); return 'hsl(' + (240 * (1 - t)).toFixed(0) + ',85%,50%)'; }
  function R(x, y, w, h, cls, fill) { return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + Math.max(0, h).toFixed(1) + '"' + (cls ? ' class="' + cls + '"' : '') + (fill ? ' fill="' + fill + '"' : '') + '/>'; }
  function P(d, cls, fill) { return '<path d="' + d + '"' + (cls ? ' class="' + cls + '"' : '') + (fill ? ' fill="' + fill + '"' : '') + '/>'; }
  function arrow(x, y, dir) { return '<path class="mo-ar" d="M' + x + ' ' + y + 'v' + (dir * 16) + 'm-5 ' + (-dir * 6) + 'l5 ' + (dir * 6) + 'l5 ' + (-dir * 6) + '"/>'; }

  // ---------- 시험별 그림 (viewBox 300 × 200). fr 0~1 진행, u 사용률, br 파단 여부 ----------
  function drawTension(fr, u, br, dogb) {
    var dy = 16 * fr + (br ? 7 : 0), top = 52 - dy, bot = 150, cx = 150, w = dogb ? 30 : 26, n = dogb ? 16 : 26, s = '', col = hue(u), mid = (top + bot) / 2;
    var body = function (y1, y2) { // eslint-disable-line
      if (!dogb) return R(cx - w / 2, y1, w, y2 - y1, 'mo-sp', col);
      return P('M' + (cx - w / 2) + ' ' + y1 + 'h' + w + 'v' + Math.min(10, (y2 - y1) / 4) + 'q0 8 ' + (-(w - n) / 2) + ' 12V' + (y2 - 22) + 'q' + ((w - n) / 2) + ' 4 ' + ((w - n) / 2) + ' 12V' + y2 + 'h' + (-w) + 'v-10q0 -8 ' + ((w - n) / 2) + ' -12V' + (y1 + 22) + 'q' + (-(w - n) / 2) + ' -4 ' + (-(w - n) / 2) + ' -12z', 'mo-sp', col);
    };
    if (!br) s += body(top - 26, bot + 26);
    else { var g2 = 5; s += R(cx - n / 2, mid + g2, n, bot + 26 - mid - g2, 'mo-sp', hue(0.05)) + R(cx - n / 2, top - 26, n, mid - g2 - 7 - (top - 26), 'mo-sp', hue(0.05)) + P('M' + (cx - n / 2 - 6) + ' ' + (mid - 1) + 'l6 4l5 -5l5 5l5 -5l6 4', 'mo-crack'); }
    if (!br) s += P('M' + (cx - n / 2 - 5) + ' ' + (mid - 18 - 5 * fr) + 'h' + (n + 10) + 'M' + (cx - n / 2 - 5) + ' ' + (mid + 18 - 0) + 'h' + (n + 10), 'mo-gm');
    s += R(cx - 34, top - 34, 68, 34, 'mo-fx') + R(cx - 34, bot, 68, 34, 'mo-fx') + arrow(cx + 52, top - 4, -1);
    return s;
  }
  function drawComp(fr, u, br) {
    var dy = 9 * fr, top = 62 + dy, bot = 146, cx = 150, w = 30, s = '', col = hue(br ? 0.05 : u);
    if (!br) s += R(cx - w / 2, top, w, bot - top, 'mo-sp', col);
    else s += P('M' + (cx - w / 2) + ' ' + top + 'h' + w + 'L' + (cx + w / 2 + 6) + ' ' + ((top + bot) / 2 + 8) + 'L' + (cx + w / 2) + ' ' + bot + 'h' + (-w) + 'L' + (cx - w / 2 + 6) + ' ' + ((top + bot) / 2 - 8) + 'z', 'mo-sp', col) + P('M' + (cx - w / 2 - 2) + ' ' + ((top + bot) / 2 - 12) + 'L' + (cx + w / 2 + 8) + ' ' + ((top + bot) / 2 + 12), 'mo-crack');
    s += R(cx - 46, top - 30, 92, 30, 'mo-fx') + R(cx - 46, bot, 92, 30, 'mo-fx') + arrow(cx + 62, top - 40, 1);
    return s;
  }
  function drawBend(fr, u, br, shortB, sideSign) {
    var cx = 150, half = shortB ? 40 : 82, over = shortB ? 16 : 22, th = shortB ? 22 : 11, y0 = 104, defl = (shortB ? 7 : 24) * fr, s = '', N = 28, i;
    var yAt = function (x) { var xi = (half - Math.abs(x - cx)) / (2 * half); return xi >= 0 ? y0 + defl * (3 * xi - 4 * xi * xi * xi) : y0 + defl * 3 * xi; }; // eslint-disable-line
    var x1 = cx - half - over, x2 = cx + half + over, dx = (x2 - x1) / N;
    for (i = 0; i < N; i++) {
      var xa = x1 + i * dx, xb = xa + dx, xm = (xa + xb) / 2, loc = Math.abs(xm - cx) > half ? 0 : (shortB ? 1 : 1 - Math.abs(xm - cx) / half), c = hue(br ? 0.05 : u * loc);
      s += P('M' + xa.toFixed(1) + ' ' + yAt(xa).toFixed(1) + 'L' + (xb + 0.4).toFixed(1) + ' ' + yAt(xb).toFixed(1) + 'L' + (xb + 0.4).toFixed(1) + ' ' + (yAt(xb) + th).toFixed(1) + 'L' + xa.toFixed(1) + ' ' + (yAt(xa) + th).toFixed(1) + 'z', '', c);
    }
    if (shortB && !br) s += P('M' + (cx - half) + ' ' + (yAt(cx - half) + th / 2) + 'Q' + cx + ' ' + (yAt(cx) + th / 2 + 1) + ' ' + (cx + half) + ' ' + (yAt(cx + half) + th / 2), 'mo-gm');
    if (br) s += shortB ? P('M' + (cx - half - over) + ' ' + (yAt(cx - half) + th / 2) + 'L' + (cx - 4) + ' ' + (yAt(cx) + th / 2 + 1), 'mo-crack')
      : (sideSign < 0 ? P('M' + (cx - 5) + ' ' + yAt(cx) + 'l5 ' + (th * 0.6) + 'l5 ' + (-th * 0.6), 'mo-crack') : P('M' + (cx - 5) + ' ' + (yAt(cx) + th) + 'l5 ' + (-th * 0.7) + 'l5 ' + (th * 0.7), 'mo-crack'));
    s += '<circle class="mo-fx" cx="' + cx + '" cy="' + (yAt(cx) - 9) + '" r="9"/>' + R(cx - 3, 30, 6, yAt(cx) - 9 - 30, 'mo-fx');
    s += P('M' + (cx - half) + ' ' + (y0 + th) + 'l-10 18h20z', 'mo-fx') + P('M' + (cx + half) + ' ' + (y0 + th) + 'l-10 18h20z', 'mo-fx') + R(cx - half - 26, y0 + th + 18, 2 * half + 52, 8, 'mo-fx') + arrow(cx + 20, 34, 1);
    return s;
  }
  function drawVnotch(fr, u, br) {
    var dy = 10 * fr + (br ? 5 : 0), x0 = 60, L = 180, W = 56, y0 = 72, c = x0 + L / 2, d = 13, s = '', lo = hue(br ? 0.05 : u * 0.25), hi = hue(br ? 0.05 : u);
    s += R(x0 - 8, y0 - 14, L / 2 - 14, W + 28, 'mo-fx') + R(c + 22, y0 - 14 + dy, L / 2 - 14, W + 28, 'mo-fx');
    s += P('M' + x0 + ' ' + y0 + 'H' + (c - d) + 'L' + (c - 2) + ' ' + (y0 + d) + 'V' + (y0 + W - d) + 'L' + (c - d) + ' ' + (y0 + W) + 'H' + x0 + 'z', 'mo-sp', lo);
    s += P('M' + (x0 + L) + ' ' + (y0 + dy) + 'H' + (c + d) + 'L' + (c + 2) + ' ' + (y0 + d + dy) + 'V' + (y0 + W - d + dy) + 'L' + (c + d) + ' ' + (y0 + W + dy) + 'H' + (x0 + L) + 'z', 'mo-sp', lo);
    if (!br) s += P('M' + (c - 2) + ' ' + (y0 + d) + 'L' + (c + 2) + ' ' + (y0 + d + dy) + 'V' + (y0 + W - d + dy) + 'L' + (c - 2) + ' ' + (y0 + W - d) + 'z', '', hi);
    else s += P('M' + c + ' ' + (y0 + d) + 'l-3 8l5 7l-5 8l4 7', 'mo-crack');
    return s + arrow(c + 22 + (L / 2 - 14) / 2, y0 - 34 + dy, 1);
  }
  function drawIzod(p, info) {
    var px = 150, py = 18, arm = 112, th0 = -2.0, hit = 0.5, th, broken = p >= hit, s = '';
    if (p < hit) { var a = p / hit; th = th0 * (1 - a * a); } else { var b2 = Math.min(1, (p - hit) / 0.5); th = info.rise * Math.sin(b2 * Math.PI / 2); }
    var bx = px + arm * Math.sin(th), by = py + arm * Math.cos(th), sx = px + 16, base = py + arm + 34, tip = py + arm - 16;
    s += R(sx - 22, base, 60, 30, 'mo-fx');
    if (!broken) s += P('M' + (sx - 5) + ' ' + base + 'V' + tip + 'h10V' + base + 'z', 'mo-sp', hue(0.1)) + P('M' + (sx - 5) + ' ' + (base - 1) + 'l4 -3l-4 -3', 'mo-crack');
    else { var k = Math.min(1, (p - hit) / 0.5), fx = sx + 50 * k, fy = tip + 10 - 30 * Math.sin(k * Math.PI) + 40 * k * k; s += '<g transform="translate(' + fx.toFixed(1) + ' ' + fy.toFixed(1) + ') rotate(' + (200 * k).toFixed(0) + ')">' + R(-5, -22, 10, 44, 'mo-sp', hue(0.05)) + '</g>'; }
    s += '<line class="mo-arm" x1="' + px + '" y1="' + py + '" x2="' + bx.toFixed(1) + '" y2="' + by.toFixed(1) + '"/><circle class="mo-fx" cx="' + px + '" cy="' + py + '" r="5"/><circle class="mo-fx" cx="' + bx.toFixed(1) + '" cy="' + by.toFixed(1) + '" r="14"/>';
    s += P('M' + (px + arm * Math.sin(th0)).toFixed(1) + ' ' + (py + arm * Math.cos(th0)).toFixed(1) + 'A' + arm + ' ' + arm + ' 0 0 0 ' + (px + arm * Math.sin(info.rise)).toFixed(1) + ' ' + (py + arm * Math.cos(info.rise)).toFixed(1), 'mo-gm');
    return s;
  }

  function mini(c, x) {
    var W = 280, H = 64, xm = 0, ym = 0, i; c.pts.forEach(function (q) { xm = Math.max(xm, q[0]); ym = Math.max(ym, q[1]); });
    xm = (xm || 1) * 1.05; ym = (ym || 1) * 1.15;
    var X = function (v) { return 4 + v / xm * (W - 8); }, Y = function (v) { return H - 4 - v / ym * (H - 8); }, d = ''; // eslint-disable-line
    for (i = 0; i < c.pts.length; i++) d += (i ? 'L' : 'M') + X(c.pts[i][0]).toFixed(1) + ' ' + Y(c.pts[i][1]).toFixed(1);
    var q2 = M.at(c.pts, x);
    return '<svg class="mo-mini" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><rect class="fr" x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '"/><path class="cv" d="' + d + '"/><circle class="cud" cx="' + X(q2[0]).toFixed(1) + '" cy="' + Y(q2[1]).toFixed(1) + '" r="4.5"/></svg>';
  }

  // ---------- 카드 ----------
  function build() {
    var o = M.o, host = $('moGrid'), s = '';
    cards = o.tests.map(function (k) {
      var c = M.curve(k), b = c.pts[c.best];
      return { key: k, c: c, xult: b[0], Pult: b[1], xfpf: c.fpfI !== undefined ? c.pts[c.fpfI][0] : (c.yieldI ? c.pts[c.yieldI][0] : null), yl: !!c.yieldI || k === 'e8', name: M.name(k) };
    });
    if (o.kind === 'metal') cards[0].xfpf = cards[0].c.pts[1][0];
    if (o.kind === 'plastic') {
      var iz = null; o.all.forEach(function (r) { if (r.key === 'izod') iz = r; });
      var fr = Math.min(1, iz.energy / iz.pend), c0 = Math.cos(-2.0), rise = Math.acos(Math.max(-1, Math.min(1, 1 - (1 - c0) * (1 - fr))));
      cards.push({ key: 'izod', izod: true, info: { e: iz.energy, pend: iz.pend, rise: rise }, name: T('t_izod') });
    }
    cards.forEach(function (cd, i) {
      s += '<section class="mo-card"><h2>' + cd.name + ' <span class="chip" id="moS' + i + '"></span></h2><svg class="mo-stage" id="moV' + i + '" viewBox="0 0 300 200" role="img" aria-label="' + cd.name + '"></svg><p class="mo-read" id="moR' + i + '"></p><div id="moC' + i + '"></div></section>';
    });
    host.innerHTML = s;
    $('moSum').textContent = (o.lam ? o.L.label + ', ' + f(o.h, 2) + ' mm' : o.m.name + ', ' + f(o.h, 2) + ' mm') + '. ' + T('moEdit');
  }
  function frame() {
    var p = st.p, i;
    for (i = 0; i < cards.length; i++) {
      var cd = cards[i], svg = '', stat, cls = 'ok';
      if (cd.izod) {
        svg = drawIzod(Math.min(p, 1.0), cd.info); var hitd = p >= 0.5;
        stat = T(hitd ? 'moBroken' : 'moHit'); cls = hitd ? 'bad' : 'ok';
        $('moR' + i).textContent = T('spEnergy') + ' ' + f(cd.info.e, 2) + ' J / ' + T('spPend') + ' ' + cd.info.pend + ' J · ' + T('moRise') + ' ' + f(cd.info.rise * 180 / Math.PI, 0) + '°';
        $('moC' + i).innerHTML = '<svg class="mo-mini" viewBox="0 0 280 64" aria-hidden="true"><rect class="fr" x="1" y="22" width="278" height="20"/><rect x="2" y="23" width="' + (276 * Math.min(1, cd.info.e / cd.info.pend) * (hitd ? 1 : 0)).toFixed(1) + '" height="18" fill="' + hue(Math.min(1, cd.info.e / cd.info.pend)) + '"/></svg>';
      } else {
        var fr = Math.min(1, p), br = p >= 1, x = fr * cd.xult, q = M.at(cd.c.pts, x), u = br ? 1 : q[1] / cd.Pult, k = cd.key;
        if (k === 'tension' || k === 'ptension' || k === 'e8' || k === 'rtension' || k === 'rplanar') svg = drawTension(fr, u, br && k !== 'rplanar', k !== 'tension' && k !== 'rplanar');
        else if (k === 'comp' || k === 'pcomp' || k === 'rucomp') svg = drawComp(fr, u, br && k !== 'rucomp');
        else if (k === 'flex' || k === 'pflex') svg = drawBend(fr, u, br, false, M.o.lam && M.o.t.flex.ev.length ? M.o.t.flex.ev[M.o.t.flex.ev.length - 1].sign : 1);
        else if (k === 'ilss') svg = drawBend(fr, u, br, true, 1);
        else svg = drawVnotch(fr, u, br);
        var past = cd.xfpf !== null && x >= cd.xfpf * (1 - 1e-9) && !br;
        stat = br ? T('moBroken') : past ? T(cd.yl ? 'moYield' : 'moFpf') : T('moRun'); cls = br ? 'bad' : past ? 'warn' : 'ok';
        $('moR' + i).textContent = (k === 'vnotch' ? T('shShearStrain') + ' ' + f(q[0], 3) + ' %' : T('shDisp') + ' ' + f(q[0], 3) + ' mm') + ' · ' + T('shLoad') + ' ' + (q[1] >= 10000 ? f(q[1] / 1000, 2) + ' kN' : f(q[1], 0) + ' N') + ' · ' + T('shStress') + ' ' + f(q[2], 1) + ' MPa · ' + T('moUtil') + ' ' + f(Math.min(1, q[1] / cd.Pult) * 100, 0) + ' %';
        $('moC' + i).innerHTML = mini(cd.c, x);
      }
      $('moV' + i).innerHTML = svg;
      var ch = $('moS' + i); ch.textContent = stat; ch.className = 'chip ' + cls;
    }
    var sl = $('moProg'); if (document.activeElement !== sl) sl.value = Math.round(st.p * 1000);
    $('moPlay').textContent = T(st.play ? 'moPause' : 'moPlay');
  }
  function tick(ts) {
    raf = 0;
    if (!st.play || api.st.tab !== 'motion') return;
    var dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    if (st.hold > 0) { st.hold -= dt; if (st.hold <= 0) st.p = 0; }
    else { st.p += dt / 6 * 1.15 * st.speed; if (st.p >= 1.15) { st.p = 1.15; st.hold = 1.0; } }
    frame(); raf = requestAnimationFrame(tick);
  }
  function play(on) { st.play = on; if (on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); } frame(); }
  function render(full) {
    if (!api || api.st.tab !== 'motion') return;
    M = Sheet.model();
    var s2 = api.st.mat + '|' + api.st.lang + '|' + M.o.tests.join(',');
    sig = s2; build();
    frame();
  }
  function show() { render(true); if (!reduced && !st.started) { st.started = true; st.p = 0; play(true); } else if (st.play && !raf) play(true); }
  function init(a) {
    api = a; $ = a.$;
    $('moPlay').addEventListener('click', function () { if (!st.play && st.p >= 1.15) { st.p = 0; st.hold = 0; } play(!st.play); });
    $('moReset').addEventListener('click', function () { st.p = 0; st.hold = 0; frame(); });
    $('moSpeed').addEventListener('change', function (e) { st.speed = +e.target.value; });
    $('moProg').addEventListener('input', function (e) { st.p = e.target.value / 1000; st.hold = 0; if (st.play) play(false); else frame(); });
  }
  return { init: init, render: render, show: show, state: st, stop: function () { st.play = false; } };
})();

/* app.js: 상태, 조작부, 수치 칸, 둘러보기, 식·가정 패널, CSV */
(function () {
  'use strict';
  var C = BeamCalc, T = U.T, $ = function (id) { return document.getElementById(id); };

  var MATS = {
    SS400: { E: 205, G: null, nu: 0.30, rho: 7860, crit: { type: 'vm', sy: 245 }, su: 400, el: 21, note: 'matNoteMin' },
    S235: { E: 210, G: null, nu: 0.30, rho: 7850, crit: { type: 'vm', sy: 235 }, su: 360, el: 26, note: 'matNoteMin' },
    STS304: { E: 193, G: null, nu: 0.30, rho: 7930, crit: { type: 'vm', sy: 205 }, su: 520, el: 40, note: 'matNoteMin' },
    AL6061: { E: 68.9, G: 26, nu: 0.33, rho: 2700, crit: { type: 'vm', sy: 276 }, su: 310, el: 12, note: 'matNoteTyp' }
  };
  var SRC = [
    ['S235', 'EN 10025-2, Ovako', 'https://steelnavigator.ovako.com/steel-grades/s235/pdf'],
    ['SS400', 'JIS G 3101, 中部鋼鈑', 'https://www.chubukohan.co.jp/ckCMS/wp-content/uploads/2024/05/catalog11.pdf'],
    ['STS304', 'Nippon Steel', 'https://www.nipponsteel.com/product/catalog_download/__icsFiles/afieldfile/2025/10/06/S008.pdf'],
    ['AL6061-T6', 'ASM / MatWeb', 'https://www.aerospacemetals.com/wp-content/uploads/2023/06/Aluminum-6061-T6-6061-T651.pdf'],
    ['CFRP·GFRP', 'ACP Composites', 'https://acpcomposites.com/wp-content/uploads/2024/05/Mechanical-Properties-of-Carbon-Fiber-Composite-Materials.pdf'],
    ['G23', 'NTNU TMM4175', 'https://folk.ntnu.no/nilspv/TMM4175/material-properties.html']
  ];

  var st = {
    lang: 'ko', theme: 'dark', tab: 'beam', lamSig: '', plasSig: '', mat: 'LAM',
    cu_E: 205, cu_G: 78.8, cu_rho: 7860, cu_crit: 'vm', cu_sy: 245, cu_xt: 2550, cu_xc: 1470, cu_s: 88,
    kind: 'box', L: 1000, h: 60, b: 30, t: 4, taper: 1,
    loadCase: 'udl', W: 1000, a: 1, selfW: true, Pax: 0, hang: true, zeta: 5, anim: true, shear: true, limitN: 180,
    xSec: 0, colorBy: 'vm', secMode: 'sigma', surfMetric: 'defl', autoEx: true
  };
  var NUM = { cu_E: 1, cu_G: 1, cu_rho: 1, cu_sy: 1, cu_xt: 1, cu_xc: 1, cu_s: 1, L: 1, h: 1, b: 1, t: 1, taper: 1, W: 1, a: 1, Pax: 1, zeta: 1, limitN: 1, xSec: 1 };
  var SURF_KEYS = ['mat', 'lamSig', 'plasSig', 'cu_E', 'cu_G', 'cu_rho', 'cu_crit', 'cu_sy', 'cu_xt', 'cu_xc', 'cu_s', 'kind', 'b', 't', 'taper', 'loadCase', 'W', 'a', 'selfW', 'Pax', 'shear'];
  var LOAD_KEYS = { W: 1, loadCase: 1, a: 1, selfW: 1, Pax: 1 };

  var p = null, res = null, surf = null, surfSig = '', surfTimer = 0;
  var views = [], rebuild = { s: true, d: true, c: true, f: true }, raf = 0;
  var anim = { on: false, t0: 0, scale: 1, end: 0, d: 1 }, theme = null, exag = 1, lastTs = 0;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 적층 복합재: 설정은 물성 시트 탭과 같이 씀 ----------
  var LamCfg = Lam.defaults(), lamL = null, lamEq = null, lamBak = null;
  try {
    var saved = JSON.parse(localStorage.getItem('bb_lam') || 'null');
    if (saved && saved.lam && saved.lam.plies && saved.lam.plies.length && saved.mats && saved.mats.cf_ud && saved.resin) {
      var okm = true; saved.lam.plies.forEach(function (q) { if (!saved.mats[q.m]) okm = false; });
      if (okm) LamCfg = saved;
    }
  } catch (e) { /* 저장소 없음 */ }
  var RubCfg = JSON.parse(JSON.stringify(Spec.RUB));
  try { var sr0 = JSON.parse(localStorage.getItem('bb_rub') || 'null'); if (sr0) Object.keys(RubCfg).forEach(function (k) { if (sr0[k]) Object.keys(RubCfg[k]).forEach(function (q) { if (sr0[k][q] > 0) RubCfg[k][q] = sr0[k][q]; }); }); } catch (e) { /* 저장소 없음 */ }
  function setRub(mat, k, v) { RubCfg[mat][k] = v; st.plasSig = JSON.stringify(PlasCfg) + JSON.stringify(RubCfg); try { localStorage.setItem('bb_rub', JSON.stringify(RubCfg)); } catch (e) { /* 저장소 없음 */ } update(); }
  var PlasCfg = JSON.parse(JSON.stringify(Spec.PLAS));
  try {
    var sp0 = JSON.parse(localStorage.getItem('bb_plas') || 'null');
    if (sp0) Object.keys(PlasCfg).forEach(function (k) { if (sp0[k]) Object.keys(PlasCfg[k]).forEach(function (q) { if (sp0[k][q] > 0) PlasCfg[k][q] = sp0[k][q]; }); });
  } catch (e) { /* 저장소 없음 */ }
  function setPlas(mat, k, v) {
    PlasCfg[mat][k] = v; st.plasSig = JSON.stringify(PlasCfg);
    try { localStorage.setItem('bb_plas', st.plasSig); } catch (e) { /* 저장소 없음 */ }
    update();
  }
  function lamSync() {
    if (st.mat !== 'LAM') {
      if (lamBak) { st.h = lamBak.h; st.t = lamBak.t; st.taper = lamBak.taper; lamBak = null; }
      lamL = lamEq = null; return;
    }
    if (!lamBak) lamBak = { h: st.h, t: st.t, taper: st.taper };
    lamL = Lam.build(LamCfg);
    var flat = st.kind === 'rect';
    lamEq = Lam.beamEquiv(lamL, flat);
    if (flat) { st.h = +lamL.h.toFixed(4); st.taper = 1; st.t = lamBak.t; } else { st.t = +lamL.h.toFixed(4); st.h = lamBak.h; st.taper = lamBak.taper; }
  }
  function lamChanged() {
    st.lamSig = JSON.stringify(LamCfg);
    try { localStorage.setItem('bb_lam', st.lamSig); } catch (e) { /* 저장소 없음 */ }
    lamSync(); syncInputs(); update();
  }
  function matInfo() {
    var m = params().mat, d = MATS[st.mat];
    return { E: m.E, rho: m.rho, crit: m.crit, su: d ? d.su : null, el: d ? d.el : null, name: st.mat === 'custom' || PlasCfg[st.mat] || RubCfg[st.mat] ? T('mat_' + st.mat) : st.mat };
  }
  function setTab(t) {
    st.tab = t; document.body.setAttribute('data-tab', t); saveView();
    var bs = document.querySelectorAll('.tab'); for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-selected', bs[i].getAttribute('data-tab') === t ? 'true' : 'false');
    $('sheet').hidden = t !== 'sheet'; $('motion').hidden = t !== 'motion'; $('fab').hidden = t !== 'fab';
    if (t !== 'beam') { stopDemo(true); tour.on = false; tourRender(); }
    if (t === 'sheet' || t === 'fab') Sheet.render(true);
    else if (t === 'motion') Motion.show();
    else { views.forEach(function (v) { v.dirty = true; }); rebuild.s = rebuild.d = rebuild.c = rebuild.f = true; requestFrame(); }
  }

  function params() {
    var m;
    if (st.mat === 'LAM' && lamEq) {
      m = { E: lamEq.E, G: lamEq.G, nu: 0.3, rho: lamEq.rho, crit: { type: 'max', xt: lamEq.xt, xc: lamEq.xc, s: lamEq.s } };
    } else if (RubCfg[st.mat]) {
      var rc = RubCfg[st.mat];
      m = { E: Spec.gent(rc.hs), G: null, nu: 0.49, rho: rc.rho * 1000, crit: { type: 'vm', sy: rc.su } };
    } else if (PlasCfg[st.mat]) {
      var pc = PlasCfg[st.mat];
      m = { E: pc.E * 1000, G: null, nu: 0.38, rho: pc.rho * 1000, crit: { type: 'vm', sy: pc.su } };
    } else if (st.mat === 'custom') {
      m = { E: st.cu_E * 1000, G: st.cu_G * 1000, nu: 0.3, rho: st.cu_rho,
        crit: st.cu_crit === 'vm' ? { type: 'vm', sy: st.cu_sy } : { type: 'max', xt: st.cu_xt, xc: st.cu_xc, s: st.cu_s } };
    } else {
      var d = MATS[st.mat];
      m = { E: d.E * 1000, G: d.G ? d.G * 1000 : null, nu: d.nu, rho: d.rho, crit: d.crit };
    }
    return { mat: m, kind: st.kind, L: st.L, h: st.h, b: st.b, t: st.t, taper: st.taper,
      loadCase: st.loadCase === 'point' ? 'point' : (st.loadCase === 'udl' ? 'udl' : 'tri'), triDir: st.loadCase === 'tri_tip' ? 'tip' : 'root',
      W: st.W, a: st.a, selfW: st.selfW, Pax: st.Pax * 1000, hang: st.hang, zeta: st.zeta / 100, shear: st.shear, limitN: st.limitN };
  }

  // ---------- 조작 패널 ----------
  var CTRL = [
    { g: 'gMat', tour: 3, items: [
      { t: 'select', k: 'mat', lab: 'mat', opts: ['LAM'].concat(Object.keys(Spec.RUB), Object.keys(Spec.PLAS), ['SS400', 'S235', 'STS304', 'AL6061', 'custom']), pre: 'mat_' },
      { t: 'html', id: 'matInfo' },
      { t: 'num', k: 'cu_E', lab: 'cE', unit: 'GPa', min: 0.1, max: 1000, step: 0.1, when: 'custom' },
      { t: 'num', k: 'cu_G', lab: 'cG', unit: 'GPa', min: 0.05, max: 500, step: 0.1, when: 'custom' },
      { t: 'num', k: 'cu_rho', lab: 'cRho', unit: 'kg/m³', min: 100, max: 25000, step: 10, when: 'custom' },
      { t: 'select', k: 'cu_crit', lab: 'cCrit', opts: ['vm', 'max'], names: ['critVm', 'critMax'], when: 'custom' },
      { t: 'num', k: 'cu_sy', lab: 'cSy', unit: 'MPa', min: 1, max: 5000, step: 1, when: 'cvm' },
      { t: 'num', k: 'cu_xt', lab: 'cXt', unit: 'MPa', min: 1, max: 10000, step: 1, when: 'cmax' },
      { t: 'num', k: 'cu_xc', lab: 'cXc', unit: 'MPa', min: 1, max: 10000, step: 1, when: 'cmax' },
      { t: 'num', k: 'cu_s', lab: 'cS', unit: 'MPa', min: 1, max: 1000, step: 1, when: 'cmax' }
    ] },
    { g: 'gSec', tour: 4, items: [
      { t: 'select', k: 'kind', lab: 'kind', opts: ['rect', 'tube', 'box', 'ibeam'], pre: 'kind_', tour: 3 },
      { t: 'range', k: 'L', lab: 'pL', unit: 'mm', min: 200, max: 3000, step: 10 },
      { t: 'range', k: 'h', lab: 'pH', unit: 'mm', min: 10, max: 300, step: 1 },
      { t: 'range', k: 'b', lab: 'pB', unit: 'mm', min: 10, max: 200, step: 1, when: 'notTube' },
      { t: 'range', k: 't', lab: 'pT', unit: 'mm', min: 1, max: 20, step: 0.5, when: 'hollow' },
      { t: 'html', id: 'tNote' },
      { t: 'range', k: 'taper', lab: 'pTaper', unit: '', min: 0.3, max: 1, step: 0.01 }
    ] },
    { g: 'gLoad', tour: 2, items: [
      { t: 'select', k: 'loadCase', lab: 'loadCase', opts: ['point', 'udl', 'tri_root', 'tri_tip'], pre: 'lc_' },
      { t: 'range', k: 'W', lab: 'pW', unit: 'N', min: 0, max: 20000, step: 50 },
      { t: 'range', k: 'a', lab: 'pA', unit: '', min: 0.05, max: 1, step: 0.01, when: 'point' },
      { t: 'check', k: 'selfW', lab: 'selfW' },
      { t: 'range', k: 'Pax', lab: 'pPax', unit: 'kN', min: -50, max: 50, step: 0.5 }
    ] },
    { g: 'gDyn', tour: 2, items: [
      { t: 'check', k: 'hang', lab: 'hang' },
      { t: 'range', k: 'zeta', lab: 'pZeta', unit: '%', min: 0, max: 20, step: 0.5 },
      { t: 'check', k: 'anim', lab: 'anim' },
      { t: 'html', id: 'respBox' },
      { t: 'check', k: 'shear', lab: 'shear' },
      { t: 'select', k: 'limitN', lab: 'limitN', opts: [120, 180, 240, 360], fmt: function (v) { return 'L/' + v; } }
    ] },
    { g: 'gView', items: [
      { t: 'range', k: 'xSec', lab: 'xSec', unit: 'mm', min: 0, max: 1000, step: 1 },
      { t: 'check', k: 'autoEx', lab: 'autoEx' }
    ] }
  ];

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }

  function buildPanel() {
    var host = $('panel');
    CTRL.forEach(function (grp) {
      var sec = el('section', 'grp'); if (grp.tour) sec.setAttribute('data-tour', grp.tour);
      var h = el('h2', 'grp-h'); h.setAttribute('data-i', grp.g); sec.appendChild(h);
      grp.items.forEach(function (it) {
        var row = el('div', 'row row-' + it.t); if (it.when) row.setAttribute('data-when', it.when);
        if (it.tour) row.setAttribute('data-tour', it.tour);
        if (it.t === 'html') { row.id = it.id; sec.appendChild(row); return; }
        var id = 'c_' + it.k, lab = el('label', 'lab'); lab.setAttribute('for', id); lab.setAttribute('data-i', it.lab); lab.id = 'l_' + it.k;
        if (it.t === 'select') {
          var s = el('select'); s.id = id; s.setAttribute('data-k', it.k);
          it.opts.forEach(function (o, i) {
            var op = el('option'); op.value = o;
            if (it.fmt) op.textContent = it.fmt(o); else op.setAttribute('data-i', it.names ? it.names[i] : it.pre + o);
            s.appendChild(op);
          });
          row.appendChild(lab); row.appendChild(s);
        } else if (it.t === 'check') {
          var c = el('input'); c.type = 'checkbox'; c.id = id; c.setAttribute('data-k', it.k);
          row.appendChild(c); row.appendChild(lab);
        } else {
          var n = el('input', 'num'); n.type = 'number'; n.id = it.t === 'num' ? id : 'n_' + it.k; n.min = it.min; n.max = it.max; n.step = it.step; n.setAttribute('data-k', it.k);
          n.setAttribute('aria-labelledby', 'l_' + it.k);
          var u = el('span', 'unit', it.unit), top = el('div', 'row-top');
          top.appendChild(lab); var box = el('span', 'numbox'); box.appendChild(n); box.appendChild(u); top.appendChild(box);
          row.appendChild(top);
          if (it.t === 'range') {
            var r = el('input'); r.type = 'range'; r.id = id; r.min = it.min; r.max = it.max; r.step = it.step; r.setAttribute('data-k', it.k);
            r.setAttribute('aria-labelledby', 'l_' + it.k);
            row.appendChild(r);
          }
        }
        sec.appendChild(row);
      });
      host.appendChild(sec);
    });
    var rb = $('respBox');
    rb.innerHTML = '<div class="resp-h"><span data-i="respTitle"></span><button type="button" id="btnPlay" class="btn sm" data-i="btnPlay"></button></div><canvas id="respCv" height="84"></canvas>';
  }

  function readInput(e) {
    var k = e.getAttribute('data-k'), v;
    if (e.type === 'checkbox') v = e.checked;
    else if (NUM[k]) {
      v = parseFloat(e.value);
      if (!isFinite(v)) return null;
      var mn = parseFloat(e.min), mx = parseFloat(e.max);
      if (isFinite(mn) && v < mn) v = mn;
      if (isFinite(mx) && v > mx) v = mx;
    } else v = e.value;
    return { k: k, v: v };
  }

  function syncInputs(skip) {
    var list = document.querySelectorAll('[data-k]');
    for (var i = 0; i < list.length; i++) {
      var e = list[i], k = e.getAttribute('data-k');
      if (e === skip) continue;
      if (e.type === 'checkbox') e.checked = !!st[k];
      else if (String(e.value) !== String(st[k])) e.value = st[k];
    }
    var xs = $('c_xSec'), xn = $('n_xSec'), xv = $('vp_xSec');
    xs.max = st.L; xn.max = st.L; if (xv) xv.max = st.L;
    var cond = { custom: st.mat === 'custom', cvm: st.mat === 'custom' && st.cu_crit === 'vm', cmax: st.mat === 'custom' && st.cu_crit === 'max',
      notTube: st.kind !== 'tube', hollow: st.kind !== 'rect', point: st.loadCase === 'point' };
    var rows = document.querySelectorAll('[data-when]');
    for (i = 0; i < rows.length; i++) rows[i].hidden = !cond[rows[i].getAttribute('data-when')];
    var lam = st.mat === 'LAM', flat = st.kind === 'rect', dis = { h: lam && flat, taper: lam && flat, t: lam && !flat };
    ['h', 'taper', 't'].forEach(function (k) { ['c_', 'n_'].forEach(function (pre) { var e = $(pre + k); if (e) e.disabled = dis[k]; }); });
    $('l_h').setAttribute('data-i', st.kind === 'tube' ? 'pHd' : 'pH');
    $('l_h').textContent = T(st.kind === 'tube' ? 'pHd' : 'pH');
  }

  function setState(k, v, final, src) {
    if (st[k] === v && !final) return;
    st[k] = v;
    if (k === 'L' && st.xSec > st.L) st.xSec = st.L;
    if (k === 'lang') { applyLang(); return; }
    if (k === 'theme') { applyTheme(); return; }
    if (lamBak && (k === 'h' || k === 't' || k === 'taper')) lamBak[k] = v;
    if (k === 'mat' || k === 'kind' || st.mat === 'LAM') lamSync();
    if (k === 'mat') saveView();
    syncInputs(k === 'mat' || k === 'kind' ? null : src);
    update();
    if (final && LOAD_KEYS[k]) startAnim();
  }

  function onInput(ev) {
    var e = ev.target;
    if (!e.getAttribute || !e.getAttribute('data-k')) return;
    var r = readInput(e);
    if (!r) return;
    var fin = ev.type === 'change';
    if (fin && e.type === 'number') e.value = r.v;
    setState(r.k, r.v, fin, fin ? null : e);
  }

  // ---------- 계산과 화면 갱신 ----------
  function update() {
    p = params();
    res = C.analyze(p);
    exag = st.autoEx ? Scenes.autoExag(p, res) : 1;
    var sig = SURF_KEYS.map(function (k) { return st[k]; }).join('|');
    if (sig !== surfSig) {
      surfSig = sig;
      if (!surf) computeSurface(); else { clearTimeout(surfTimer); surfTimer = setTimeout(computeSurface, 140); }
    }
    rebuild.s = rebuild.d = rebuild.c = rebuild.f = true;
    renderKpis(); renderInfo(); drawResp();
    if ($('notes').classList.contains('open')) renderNotes();
    if (st.tab === 'sheet' || st.tab === 'fab') Sheet.render(false); else if (st.tab === 'motion') Motion.render(false); else requestFrame();
  }
  function computeSurface() {
    surf = C.surface(params(), 25, 25, Scenes.SURF_RNG, 80);
    rebuild.f = true; requestFrame();
  }
  function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }

  function ctx() {
    return { p: p, res: res, theme: theme, exag: exag, animD: anim.d, xSec: Math.min(st.xSec, st.L), colorBy: st.colorBy, secMode: st.secMode, surf: surf, surfMetric: st.surfMetric };
  }

  function frame(ts) {
    raf = 0; lastTs = ts;
    if (st.tab !== 'beam') return;
    if (anim.on) {
      var tr = (performance.now() - anim.t0) / 1000;
      if (tr >= anim.end) { anim.on = false; anim.d = 1; } else anim.d = C.stepResp(tr * anim.scale, res.f1, p.zeta);
      rebuild.s = true; drawResp(tr * anim.scale);
    }
    var c = ctx(), r;
    if (rebuild.s) { r = Scenes.buildStress(views[0], c); legend('leg0', r.key, r.range); rebuild.s = false; }
    if (rebuild.d) { r = Scenes.buildDiagrams(views[1], c); diagTable(r.vals); rebuild.d = false; }
    if (rebuild.c) { r = Scenes.buildSection(views[2], c); legend('leg2', r.key, r.range); rebuild.c = false; }
    if (rebuild.f) {
      r = Scenes.buildSurface(views[3], c); rebuild.f = false;
      if (r) $('leg3x').textContent = T(st.surfMetric === 'defl' ? 'mDefl' : (st.surfMetric === 'stress' ? 'mStress' : 'mMass')) + ' ' + (r.isLog ? U.sig(r.vmin, 2) : '0') + ' ~ ' + U.sig(r.vmax, 3) + ' ' + r.unit + (r.isLog ? ', ' + T('lLog') : '');
    }
    for (var i = 0; i < 4; i++) views[i].render();
    if (anim.on) requestFrame();
  }

  function startAnim() {
    if (!st.anim || reduced || !res || !isFinite(res.f1) || !(res.f1 > 0) || !res.stable || !(Math.abs(res.tip) > 0)) return;
    var T1 = 1 / res.f1, z = p.zeta, w = 2 * Math.PI * res.f1;
    anim.scale = T1 / 0.9;
    var tEnd = z > 0 ? Math.log(60) / (z * w) : 6 * T1;
    anim.end = Math.min(7, tEnd / anim.scale);
    anim.t0 = performance.now(); anim.on = true; anim.d = 0;
    requestFrame();
  }

  // ---------- 수치 칸 ----------
  function chip(id, cls, key) { var e = $(id); e.className = 'chip ' + cls; e.textContent = T(key); e.parentNode.parentNode.setAttribute('data-state', cls); }
  function renderKpis() {
    var r = res, ok = r.stable;
    $('k0v').textContent = ok ? U.mm(r.tip) : '–';
    var over = r.tip > r.dLim;
    $('k0s').textContent = ok ? 'L/' + (r.tip > 0 ? U.fix(st.L / r.tip, 0) : '∞') + ', ' + T('sStiff') + ' ' + (isFinite(r.k) ? U.sig(r.k, 4) : '–') + ' N/mm' : T('unstableShort');
    chip('k0c', !ok || over ? 'bad' : 'ok', !ok || over ? 'sLimitNg' : 'sLimitOk');
    $('k1l').textContent = T(p.mat.crit.type === 'vm' ? 'kPeakVm' : 'kPeakSig');
    $('k1v').textContent = ok ? U.fix(r.peak, 1) : '–';
    $('k1s').textContent = T('sAt') + ' ' + U.fix(r.peakX, 0) + ' mm';
    $('k2v').textContent = ok ? (isFinite(r.SF) ? (r.SF >= 100 ? U.fix(r.SF, 0) : U.fix(r.SF, 2)) : '∞') : '–';
    $('k2s').textContent = T('sGov') + ' ' + T('gov_' + r.gov);
    var sc = !ok || r.SF < 1 ? 'bad' : (r.SF < 1.5 ? 'warn' : 'ok');
    chip('k2c', sc, sc === 'bad' ? 'chipBad' : (sc === 'warn' ? 'chipWarn' : 'chipOk'));
    $('k3v').textContent = U.fix(r.tauMax, 2);
    $('k3s').textContent = T('sShearShare') + ' ' + U.fix(r.shearFrac * 100, 2) + ' %';
    $('k4v').textContent = U.fix(r.R, 0);
    $('k4s').textContent = T('sMoment') + ' ' + U.fix(r.M0 / 1000, 1) + ' N·m';
    $('k5v').textContent = U.fix(r.f1, 2);
    $('k5s').textContent = T('sDlf') + ' ×' + U.fix(r.dlf, 2);
    $('k6v').textContent = U.fix(r.mass, 2);
    $('k6s').textContent = T('sEnergy') + ' ' + U.sig(r.U, 3) + ' J';
    var ratio = p.Pax > 0 ? p.Pax / r.PcrMin : 0;
    $('k7v').textContent = U.fix(ratio * 100, ratio < 0.1 ? 1 : 0);
    $('k7s').textContent = 'Pcr ' + T('pcrIn') + ' ' + U.sig(r.PcrS / 1000, 3) + ', ' + T('pcrOut') + ' ' + U.sig(r.PcrW / 1000, 3) + ' kN' + (p.Pax ? ', ' + T('sAmp') + ' ×' + (ok ? U.fix(r.amp, 2) : '–') : '');
    var bc = !ok || ratio >= 1 ? 'bad' : (ratio >= 0.5 ? 'warn' : 'ok');
    chip('k7c', bc, bc === 'bad' ? 'chipBad' : (bc === 'warn' ? 'chipWarn' : 'chipOk'));
    var al = [];
    if (!ok) al.push(T('sUnstable'));
    if (st.L / st.h < 5) al.push(T('lowSlender'));
    if (ok && Math.abs(res.tip) > 0.1 * st.L) al.push(T('largeDefl'));
    if (st.mat === 'LAM' && lamL && lamL.warn.length) al.push(T('vfWarn'));
    if (RubCfg[st.mat]) al.push(T('rubNoBeam'));
    var a = $('alerts'); a.hidden = !al.length; a.textContent = al.join('  ');
  }

  function renderInfo() {
    var d = MATS[st.mat] || null, m = p.mat, G = m.G || m.E / (2 * (1 + m.nu));
    var s = 'E ' + U.sig(m.E / 1000, 4) + ' GPa, G ' + U.sig(G / 1000, 3) + ' GPa, ' + U.fix(m.rho, 0) + ' kg/m³, ';
    s += m.crit.type === 'vm' ? T('cSy') + ' ' + m.crit.sy + ' MPa' : T('cXt') + ' ' + U.sig(m.crit.xt, 4) + ', ' + T('cXc') + ' ' + U.sig(m.crit.xc, 4) + ', ' + T('cS') + ' ' + U.sig(m.crit.s, 3) + ' MPa';
    $('matInfo').innerHTML = '';
    if (st.mat === 'LAM' && lamL) {
      $('matInfo').appendChild(el('p', 'note strong', lamL.label + ', ' + lamL.n + ' ' + T('lmPlies') + ', ' + U.fix(lamL.h, 2) + ' mm'));
      $('matInfo').appendChild(el('p', 'note', T(st.kind === 'rect' ? 'lmFlat' : 'lmWall')));
      var eb = el('button', 'btn sm', T('lmEdit')); eb.type = 'button'; eb.addEventListener('click', function () { setTab('sheet'); });
      $('matInfo').appendChild(eb);
    }
    $('matInfo').appendChild(el('p', 'note', s));
    $('matInfo').appendChild(el('p', 'note', T(st.mat === 'LAM' ? 'matNoteLam' : RubCfg[st.mat] ? 'matNoteRub' : PlasCfg[st.mat] ? 'matNotePlas' : (d ? d.note : 'matNoteCustom'))));
    var tn = $('tNote'); tn.innerHTML = '';
    if (st.kind !== 'rect' && res.tE < st.t - 1e-9) tn.appendChild(el('p', 'note warn', T('tClamp') + ' ' + U.fix(res.tE, 2) + ' mm'));
    $('vs0').textContent = (st.mat === 'custom' || PlasCfg[st.mat] || RubCfg[st.mat] ? T('mat_' + st.mat) : (st.mat === 'LAM' ? lamL.label : st.mat)) + ', ' + T('kind_' + st.kind) + ', L/h ' + U.fix(st.L / st.h, 1);
    $('ex0').textContent = T('exag') + ' ×' + U.fix(exag, 0) + (anim.on ? ', ' + T('slow') : '');
    $('vs2').textContent = 'x = ' + U.fix(Math.min(st.xSec, st.L), 0) + ' mm, h = ' + U.fix(st.h * (1 - (1 - st.taper) * Math.min(st.xSec, st.L) / st.L), 1) + ' mm';
  }

  function legend(id, key, rg) {
    var e = $(id), name = key === 'vm' ? T('cVm') : (key === 'sigma' ? T('cSigma') : (key === 'tau' ? T('cTau') : T('cUtil')));
    var unit = key === 'util' ? '' : ' MPa';
    e.querySelector('.leg-t').textContent = name;
    e.querySelector('.leg-a').textContent = (key === 'util' ? '0' : U.fix(rg[0], 1)) + unit;
    e.querySelector('.leg-b').textContent = (key === 'util' ? '1.0' : U.fix(rg[1], 1)) + unit;
  }
  function diagTable(vals) {
    var e = $('dtab'); e.innerHTML = '';
    var cap = el('div', 'dt-cap', T('dAtX') + ' x = ' + U.fix(Math.min(st.xSec, st.L), 0) + ' mm'); e.appendChild(cap);
    vals.forEach(function (v) {
      var r = el('div', 'dt-row'), sw = el('i', 'sw ser-' + v.k);
      r.appendChild(sw); r.appendChild(el('span', 'dt-n', v.name)); r.appendChild(el('span', 'dt-v', v.text)); e.appendChild(r);
    });
  }

  // ---------- 계단 하중 응답 그림 ----------
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function drawResp(tNow) {
    var cv = $('respCv'); if (!cv || !res) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 260, h = 84;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    if (!isFinite(res.f1) || !(res.f1 > 0)) return;
    var T1 = 1 / res.f1, tmax = 6 * T1, z = p.zeta, pad = 6, y1 = h - 14, ys = (y1 - pad) / 2.1;
    function X(t) { return pad + (w - 2 * pad) * t / tmax; }
    function Y(d) { return y1 - d * ys; }
    g.strokeStyle = cssVar('--line'); g.lineWidth = 1;
    g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w - pad, Y(0)); g.stroke();
    g.setLineDash([4, 3]); g.beginPath(); g.moveTo(pad, Y(1)); g.lineTo(w - pad, Y(1)); g.stroke(); g.setLineDash([]);
    g.beginPath();
    for (var i = 0; i <= 240; i++) { var t = tmax * i / 240, d = C.stepResp(t, res.f1, z); if (i) g.lineTo(X(t), Y(d)); else g.moveTo(X(t), Y(d)); }
    g.strokeStyle = cssVar('--accent'); g.lineWidth = 1.6; g.stroke();
    g.lineTo(X(tmax), Y(0)); g.lineTo(X(0), Y(0)); g.closePath(); g.globalAlpha = 0.12; g.fillStyle = cssVar('--accent'); g.fill(); g.globalAlpha = 1;
    var tp = z < 1 ? T1 / (2 * Math.sqrt(1 - z * z)) : 0;
    g.fillStyle = cssVar('--ink'); g.beginPath(); g.arc(X(tp), Y(res.dlf), 3, 0, 6.3); g.fill();
    g.font = '12px ' + cssVar('--font-body'); g.textBaseline = 'middle';
    g.fillText('×' + U.fix(res.dlf, 2), X(tp) + 7, Y(res.dlf) + 1);
    g.fillStyle = cssVar('--ink-2'); g.textBaseline = 'alphabetic';
    g.fillText('0', pad, h - 2); g.textAlign = 'right'; g.fillText(U.sig(tmax, 2) + ' s', w - pad, h - 2); g.textAlign = 'left';
    if (tNow !== undefined && anim.on && tNow <= tmax) {
      g.fillStyle = cssVar('--warn'); g.beginPath(); g.arc(X(tNow), Y(C.stepResp(tNow, res.f1, z)), 4, 0, 6.3); g.fill();
    }
  }

  // ---------- 언어, 바탕 ----------
  function applyLang() {
    U.setLang(st.lang);
    document.documentElement.lang = st.lang;
    var list = document.querySelectorAll('[data-i]');
    for (var i = 0; i < list.length; i++) list[i].textContent = T(list[i].getAttribute('data-i'));
    list = document.querySelectorAll('[data-i-title]');
    for (i = 0; i < list.length; i++) list[i].title = T(list[i].getAttribute('data-i-title'));
    $('btnTheme').textContent = T(st.theme === 'dark' ? 'themeToLight' : 'themeToDark');
    document.title = (SITE ? 'STAR Works — ' : '') + T('title');
    if (!SITE) { try { localStorage.setItem('bb_lang', st.lang); } catch (e) { /* 저장소 없음 */ } }
    Sheet.camLang(st.lang); Order.relang();
    var tb = document.querySelectorAll('.tab'); for (i = 0; i < tb.length; i++) tb[i].textContent = T(tb[i].getAttribute('data-i'));
    syncInputs(); tourRender(); if (st.tab === 'sheet' || st.tab === 'fab') Sheet.render(true); if (st.tab === 'motion') Motion.render(true); update();
  }
  function hex(n) { var h = cssVar(n).replace('#', ''); return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]; }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', st.theme);
    theme = { ink: hex('--gl-ink'), dim: hex('--gl-dim'), grid: hex('--gl-grid'), wall: hex('--gl-wall'), accent: hex('--gl-accent'), mesh: hex('--gl-mesh') };
    var bg = hex('--gl-bg');
    views.forEach(function (v) { v.bg = bg; v.dirty = true; });
    $('btnTheme').textContent = T(st.theme === 'dark' ? 'themeToLight' : 'themeToDark');
    try { localStorage.setItem('bb_theme', st.theme); } catch (e) { /* 저장소 없음 */ }
    if (res) { rebuild.s = rebuild.d = rebuild.c = rebuild.f = true; drawResp(); requestFrame(); }
  }

  // ---------- 둘러보기 ----------
  var tour = { on: false, step: 0, tok: null, demo: false };
  var STEPS = [
    { vp: [0, 1, 2, 3] }, { vp: [0], grp: 2 }, { vp: [0, 2], grp: 3 }, { vp: [0, 1], grp: 4 }, { vp: [3] }, { vp: [], notes: true }
  ];
  function sleep(ms, tok) { return new Promise(function (ok, no) { setTimeout(function () { if (tok.cancel) no(new Error('cancel')); else ok(); }, ms); }); }
  function tween(k, to, ms, tok) {
    return new Promise(function (ok, no) {
      var from = st[k], t0 = performance.now();
      function stepF() {
        if (tok.cancel) { no(new Error('cancel')); return; }
        var f = Math.min(1, (performance.now() - t0) / ms), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        var v = from + (to - from) * e, inp = $('c_' + k), sp = inp ? parseFloat(inp.step) : 0;
        if (sp) v = Math.round(v / sp) * sp;
        setState(k, +v.toFixed(4), f >= 1);
        if (f < 1) requestAnimationFrame(stepF); else ok();
      }
      stepF();
    });
  }
  var DEMOS = [
    function (tk) {
      var chain = Promise.resolve();
      [0, 1, 2, 3].forEach(function (i) { chain = chain.then(function () { flash(i); return sleep(1100, tk); }); });
      return chain;
    },
    function (tk) {
      return tween('W', 4500, 1800, tk).then(function () { return sleep(2600, tk); })
        .then(function () { setState('loadCase', 'tri_root', true); return sleep(2400, tk); })
        .then(function () { setState('loadCase', 'point', true); return sleep(2400, tk); })
        .then(function () { setState('loadCase', 'udl', true); return sleep(1800, tk); });
    },
    function (tk) {
      var chain = Promise.resolve();
      ['tube', 'box', 'ibeam', 'rect'].forEach(function (k) { chain = chain.then(function () { setState('kind', k, false); return sleep(1300, tk); }); });
      ['AL6061', 'STS304', 'SS400'].forEach(function (m) { chain = chain.then(function () { setState('mat', m, false); return sleep(1500, tk); }); });
      return chain;
    },
    function (tk) {
      return tween('L', 1600, 1500, tk).then(function () { return tween('L', 1000, 1200, tk); })
        .then(function () { return tween('h', 100, 1300, tk); }).then(function () { return tween('h', 60, 1100, tk); })
        .then(function () { return tween('taper', 0.45, 1400, tk); }).then(function () { return sleep(900, tk); }).then(function () { return tween('taper', 1, 1100, tk); });
    },
    function (tk) {
      return tween('h', 140, 1600, tk).then(function () { return tween('L', 2200, 1600, tk); })
        .then(function () { setState('surfMetric', 'stress', false); return sleep(1700, tk); })
        .then(function () { setState('surfMetric', 'mass', false); return sleep(1700, tk); })
        .then(function () { setState('surfMetric', 'defl', false); return tween('L', 1000, 1200, tk); }).then(function () { return tween('h', 60, 1200, tk); });
    },
    function (tk) { openNotes(true); return sleep(2500, tk).then(function () { flashEl($('btnCsv')); return sleep(1500, tk); }); }
  ];
  function flash(i) { flashEl($('vp' + i)); }
  function flashEl(e) { e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }
  function tourMark() {
    var i, list = document.querySelectorAll('.hl');
    for (i = 0; i < list.length; i++) list[i].classList.remove('hl');
    if (!tour.on) return;
    var s = STEPS[tour.step];
    s.vp.forEach(function (v) { if (s.vp.length < 4) $('vp' + v).classList.add('hl'); });
    if (s.grp) { list = document.querySelectorAll('[data-tour="' + s.grp + '"]'); for (i = 0; i < list.length; i++) list[i].classList.add('hl'); if (list[0] && list[0].scrollIntoView) list[0].scrollIntoView({ block: 'nearest' }); }
    if (s.notes) $('btnNotes').classList.add('hl');
  }
  function tourRender() {
    var box = $('tour'); box.hidden = !tour.on; box.classList.toggle('left', tour.step === 4);
    if (!tour.on) { tourMark(); return; }
    var n = tour.step + 1;
    $('tourN').textContent = T('tourStep') + ' ' + n + ' / 6';
    $('tourT').textContent = T('t' + n); $('tourB').textContent = T('t' + n + 'b');
    $('tourPrev').disabled = tour.step === 0;
    $('tourNext').textContent = T(tour.step === 5 ? 'tourDone' : 'tourNext');
    $('tourDemo').textContent = T(tour.demo ? 'tourStop' : 'tourDemo');
    tourMark();
  }
  var snap = null;
  function stopDemo(restore) {
    if (tour.tok) tour.tok.cancel = true;
    tour.tok = null; tour.demo = false;
    if (restore && snap) { var s = snap; snap = null; Object.keys(s).forEach(function (k) { if (k !== 'lang' && k !== 'theme') st[k] = s[k]; }); syncInputs(); update(); }
  }
  function runDemo() {
    if (tour.demo) { stopDemo(true); tourRender(); return; }
    snap = JSON.parse(JSON.stringify(st));
    var tk = { cancel: false }; tour.tok = tk; tour.demo = true; tourRender();
    DEMOS[tour.step](tk).then(function () { if (!tk.cancel) { stopDemo(true); tourRender(); } }, function () { /* 중단 */ });
  }
  function tourGo(i) {
    stopDemo(true);
    if (i > 5) { tour.on = false; openNotes(false); tourRender(); return; }
    tour.step = Math.max(0, i); tour.on = true; tourRender();
  }

  // ---------- 식·가정 패널 ----------
  function openNotes(on) {
    var n = $('notes'); n.classList.toggle('open', on); $('btnNotes').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) renderNotes();
    setTimeout(function () { views.forEach(function (v) { v.dirty = true; }); requestFrame(); }, 30);
  }
  function tr(cells, head) { var r = el('tr'); cells.forEach(function (c) { r.appendChild(el(head ? 'th' : 'td', '', c)); }); return r; }
  function renderNotes() {
    var host = $('notesBody'); host.innerHTML = '';
    var r = res, B = r.B, m = p.mat, G = m.G || m.E / (2 * (1 + m.nu));
    var c1 = el('div', 'ncol'), c2 = el('div', 'ncol');
    c1.appendChild(el('h3', '', T('nEq')));
    var tb = el('table', 'ntab'); tb.appendChild(tr([T('nColItem'), T('nColEq'), T('nColVal')], true));
    var rows = [
      [T('eSec'), 'A, I, κ', 'A = ' + U.sig(B.A[0], 5) + ' mm², I = ' + U.sig(B.I[0], 5) + ' mm⁴, κ = ' + U.fix(B.kap[0], 3)],
      [T('eV'), T('eVf'), 'V0 = ' + U.fix(r.R, 0) + ' N, M0 = ' + U.fix(r.M0 / 1000, 1) + ' N·m'],
      [T('eW'), T('eWf'), U.mm(r.tipBend) + ' mm'],
      [T('eWs'), T('eWsf'), U.mm(r.tipShear) + ' mm (' + U.fix(r.shearFrac * 100, 2) + ' %)'],
      [T('eSig'), T('eSigf'), U.fix(Math.max(r.sT, r.sC), 1) + ' MPa'],
      [T('eTau'), T('eTauf'), U.fix(r.tauMax, 2) + ' MPa'],
      [T('eVm'), T('eVmf'), U.fix(r.vmMax, 1) + ' MPa'],
      [T('eF'), T('eFf'), U.fix(r.f1, 2) + ' Hz'],
      [T('eD'), T('eDf'), '×' + U.fix(r.dlf, 3)],
      [T('eP'), T('ePf'), U.sig(r.PcrS / 1000, 4) + ' / ' + U.sig(r.PcrW / 1000, 4) + ' kN'],
      [T('eA'), T('eAf'), '×' + U.fix(r.amp, 3) + ' (' + r.iters + ' ' + T('itersWord') + ')'],
      [T('eU'), T('eUf'), U.sig(r.U, 4) + ' J'],
      [T('eK'), T('eKf'), 'E = ' + U.sig(m.E / 1000, 4) + ' GPa, G = ' + U.sig(G / 1000, 3) + ' GPa']
    ];
    rows.forEach(function (x) { tb.appendChild(tr(x)); });
    var wrap = el('div', 'tscroll'); wrap.appendChild(tb); c1.appendChild(wrap);
    c2.appendChild(el('h3', '', T('nCheck')));
    var cf = C.closedForm(p, B);
    if (cf) {
      c2.appendChild(el('p', 'note', T('nCheckOn')));
      var t2 = el('table', 'ntab'); t2.appendChild(tr(['', T('nTheory'), T('nCalc'), T('nDiff')], true));
      var diff = cf.total > 0 ? Math.abs(r.tipBend / cf.total - 1) * 100 : 0;
      t2.appendChild(tr(['δ (mm)', U.fix(cf.total, 5), U.fix(r.tipBend, 5), U.fix(diff, 5) + ' %']));
      t2.appendChild(tr([T('nLoadPart'), U.fix(cf.load, 5), '', '']));
      t2.appendChild(tr([T('nSelfPart'), U.fix(cf.self, 5), '', '']));
      var w2 = el('div', 'tscroll'); w2.appendChild(t2); c2.appendChild(w2);
    } else c2.appendChild(el('p', 'note', T('nCheckOff')));
    c2.appendChild(el('h3', '', T('nAssume')));
    var ul = el('ul', 'nlist');
    for (var i = 1; i <= 9; i++) ul.appendChild(el('li', '', T('a' + i)));
    c2.appendChild(ul);
    c2.appendChild(el('h3', '', T('nSrc')));
    var sl = el('ul', 'nlist');
    SRC.forEach(function (s) { var li = el('li'), a = el('a', '', s[0] + ': ' + s[1]); a.href = s[2]; a.rel = 'noopener'; a.target = '_blank'; li.appendChild(a); sl.appendChild(li); });
    c2.appendChild(sl);
    host.appendChild(c1); host.appendChild(c2);
  }

  // ---------- CSV ----------
  function csvText() {
    var L = [], q = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    function row() { L.push(Array.prototype.map.call(arguments, q).join(',')); }
    var m = p.mat, G = m.G || m.E / (2 * (1 + m.nu)), r = res;
    row(T('title'), 'STAR Works'); row('');
    row('[' + T('csvInputs') + ']');
    row(T('mat'), st.mat === 'custom' ? T('mat_custom') : st.mat);
    row('E (MPa)', m.E); row('G (MPa)', +G.toFixed(1)); row(T('cRho') + ' (kg/m3)', m.rho);
    if (m.crit.type === 'vm') row(T('cSy') + ' (MPa)', m.crit.sy); else { row(T('cXt') + ' (MPa)', m.crit.xt); row(T('cXc') + ' (MPa)', m.crit.xc); row(T('cS') + ' (MPa)', m.crit.s); }
    row(T('kind'), T('kind_' + st.kind)); row('L (mm)', st.L); row((st.kind === 'tube' ? 'D' : 'h') + ' (mm)', st.h);
    if (st.kind !== 'tube') row('b (mm)', st.b);
    if (st.kind !== 'rect') row('t (mm)', +r.tE.toFixed(3));
    row(T('pTaper'), st.taper); row(T('loadCase'), T('lc_' + st.loadCase)); row('W (N)', st.W);
    if (st.loadCase === 'point') row('a/L', st.a);
    row(T('selfW'), T(st.selfW ? 'yes' : 'no')); row('P (kN)', st.Pax); row(T('hang'), T(st.hang ? 'yes' : 'no'));
    row(T('pZeta') + ' (%)', st.zeta); row(T('shear'), T(st.shear ? 'yes' : 'no')); row(T('limitN'), 'L/' + st.limitN);
    row(''); row('[' + T('csvResults') + ']');
    row(T('kTip') + ' (mm)', r.tip.toFixed(4)); row('L/δ', (st.L / r.tip).toFixed(1)); row(T('sStiff') + ' (N/mm)', isFinite(r.k) ? r.k.toFixed(2) : '');
    row(T(m.crit.type === 'vm' ? 'kPeakVm' : 'kPeakSig') + ' (MPa)', r.peak.toFixed(3)); row('x (mm)', r.peakX.toFixed(1));
    row(T('kSF'), isFinite(r.SF) ? r.SF.toFixed(3) : 'inf'); row(T('sGov'), T('gov_' + r.gov));
    row(T('kTau') + ' (MPa)', r.tauMax.toFixed(3)); row(T('sShearShare') + ' (%)', (r.shearFrac * 100).toFixed(3));
    row(T('kReact') + ' (N)', r.R.toFixed(1)); row('M0 (N·m)', (r.M0 / 1000).toFixed(2));
    row(T('kFreq') + ' (Hz)', r.f1.toFixed(3)); row(T('sDlf'), r.dlf.toFixed(4));
    row(T('kMass') + ' (kg)', r.mass.toFixed(3)); row(T('sEnergy') + ' (J)', r.U.toFixed(4));
    row('Pcr ' + T('sPcr').replace('Pcr ', '') + ' (kN)', (r.PcrS / 1000).toFixed(2), (r.PcrW / 1000).toFixed(2)); row(T('sAmp'), r.amp.toFixed(4));
    row(''); row('[' + T('csvTable') + ']');
    row('x (mm)', 'V (N)', 'M (N·m)', 'θ (rad)', 'w (mm)', 'σ ' + T('lTop') + ' (MPa)', 'σ ' + T('lBot') + ' (MPa)', 'τ max (MPa)', 'von Mises (MPa)');
    var X = r.B.x;
    for (var i = 0; i <= 40; i++) {
      var x = st.L * i / 40, f = function (a) { return C.interp(X, a, x); };
      row(x.toFixed(1), f(r.V).toFixed(2), (f(r.M) / 1000).toFixed(3), f(r.th).toExponential(5), f(r.w).toFixed(5), f(r.sTop).toFixed(3), f(r.sBot).toFixed(3), f(r.tau).toFixed(3), f(r.vm).toFixed(3));
    }
    return L.join('\r\n');
  }
  var dl = { ns: null, ready: false, local: !(window.claude && typeof window.claude.use === 'function') };
  var csvName = 'beam-board.csv', csvMime = 'text/csv;charset=utf-8';
  function openCsv() {
    var sheetTab = st.tab !== 'beam';
    csvName = sheetTab ? 'material-sheet.csv' : 'beam-board.csv'; csvMime = 'text/csv;charset=utf-8'; $('csvH').textContent = T('csvTitle');
    $('csvText').value = sheetTab ? Sheet.csv() : csvText(); $('csvMsg').textContent = '';
    $('csvSave').hidden = !(dl.local || dl.ns);
    $('csvModal').hidden = false; $('csvText').focus();
  }
  function saveCsv() {
    var txt = (/csv/.test(csvMime) ? '﻿' : '') + $('csvText').value, name = csvName, msg = $('csvMsg');
    if (dl.ns) {
      dl.ns.save({ filename: name, data: txt }).then(function () { msg.textContent = T('csvSaved'); }, function () { msg.textContent = T('csvDeclined'); });
      return;
    }
    try {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: csvMime })); a.download = name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); msg.textContent = T('csvSaved');
    } catch (e) { msg.textContent = T('csvDeclined'); }
  }
  function copyCsv() {
    var ta = $('csvText'), msg = $('csvMsg'), done = function () { msg.textContent = T('csvCopied'); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); document.execCommand('copy'); done(); }); return; }
    } catch (e) { /* 아래 방식으로 */ }
    ta.select(); try { document.execCommand('copy'); done(); } catch (e2) { /* 직접 복사 */ }
  }

  // ---------- 시작 ----------
  var SITE = window.SITE || null, tab0 = 'sheet';
  function saveView() { try { sessionStorage.setItem('bb_view', JSON.stringify({ tab: st.tab, mat: st.mat })); } catch (e) { /* 저장소 없음 */ } }
  function init() {
    var rootEl = document.documentElement, rt = rootEl.getAttribute('data-theme');
    if (rt === 'dark' || rt === 'light') st.theme = rt;
    try { var l = localStorage.getItem('bb_lang'), t = localStorage.getItem('bb_theme'); if (l === 'ko' || l === 'en') st.lang = l; if (t === 'dark' || t === 'light') st.theme = t; } catch (e) { /* 저장소 없음 */ }
    var ql = /[?&]lang=(ko|en)/.exec(location.search || ''); if (ql) st.lang = ql[1];
    if (SITE) { st.lang = SITE.lang === 'ko' ? 'ko' : 'en'; document.body.setAttribute('data-site', st.lang); }
    try { var vw = JSON.parse(sessionStorage.getItem('bb_view') || 'null'); if (vw) { if (vw.mat && (vw.mat === 'LAM' || vw.mat === 'custom' || MATS[vw.mat] || PlasCfg[vw.mat] || RubCfg[vw.mat])) st.mat = vw.mat; if (/^(sheet|motion|beam|fab)$/.test(vw.tab)) tab0 = vw.tab; } } catch (e) { /* 저장소 없음 */ }
    if (window.MutationObserver) new MutationObserver(function () {
      var v = rootEl.getAttribute('data-theme');
      if ((v === 'dark' || v === 'light') && v !== st.theme) { st.theme = v; applyTheme(); }
    }).observe(rootEl, { attributes: true, attributeFilter: ['data-theme'] });
    U.setLang(st.lang);
    buildPanel();
    var cams = [{ yaw: 0.62, pitch: 0.3, dist: 3.05, tgt: [0.05, -0.06, 0] }, { yaw: -0.4, pitch: 0.2, dist: 3.9, tgt: [0.12, 0.06, 0] }, { yaw: 1.02, pitch: 0.2, dist: 2.9, tgt: [0.16, 0, 0] }, { yaw: -0.72, pitch: 0.46, dist: 4.75, tgt: [0, -0.2, 0] }];
    for (var i = 0; i < 4; i++) {
      var v = new GL3.View($('cv' + i), $('ov' + i), cams[i]); v.onChange = requestFrame; views.push(v);
      if (!v.gl) $('vp' + i).classList.add('nogl');
    }
    var mq = window.matchMedia ? window.matchMedia('(max-width: 900px)') : null;
    function setNarrow() { views.forEach(function (v) { v.narrow = !!(mq && mq.matches); }); }
    setNarrow(); if (mq && mq.addEventListener) mq.addEventListener('change', setNarrow);
    document.addEventListener('input', onInput); document.addEventListener('change', onInput);
    $('btnLang').addEventListener('click', function () { setState('lang', st.lang === 'ko' ? 'en' : 'ko'); });
    $('btnTheme').addEventListener('click', function () { setState('theme', st.theme === 'dark' ? 'light' : 'dark'); });
    $('btnPreset').addEventListener('click', function () {
      stopDemo(false);
      var d = { mat: 'S235', kind: 'rect', L: 1000, h: 60, b: 30, t: 4, taper: 1, loadCase: 'udl', W: 4500, a: 1, selfW: true, Pax: 0, hang: true, zeta: 8, shear: true, limitN: 180, xSec: 0 };
      Object.keys(d).forEach(function (k) { st[k] = d[k]; }); syncInputs(); update(); startAnim();
    });
    $('btnTour').addEventListener('click', function () { if (tour.on) { stopDemo(true); tour.on = false; tourRender(); } else tourGo(0); });
    $('tourPrev').addEventListener('click', function () { tourGo(tour.step - 1); });
    $('tourNext').addEventListener('click', function () { tourGo(tour.step + 1); });
    $('tourDemo').addEventListener('click', runDemo);
    $('tourClose').addEventListener('click', function () { stopDemo(true); tour.on = false; tourRender(); });
    $('btnNotes').addEventListener('click', function () { openNotes(!$('notes').classList.contains('open')); });
    $('btnCsv').addEventListener('click', openCsv);
    $('csvSave').addEventListener('click', saveCsv); $('csvCopy').addEventListener('click', copyCsv);
    $('csvClose').addEventListener('click', function () { $('csvModal').hidden = true; $('btnCsv').focus(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('csvModal').hidden) { $('csvModal').hidden = true; $('btnCsv').focus(); } });
    $('btnPlay').addEventListener('click', function () { var a = st.anim; st.anim = true; startAnim(); st.anim = a; });
    var mx = document.querySelectorAll('.vp-max');
    for (i = 0; i < mx.length; i++) mx[i].addEventListener('click', function (ev) {
      var vp = ev.currentTarget.closest('.vp'), host = $('vps'), on = !vp.classList.contains('big');
      var all = host.querySelectorAll('.vp'); for (var j = 0; j < all.length; j++) all[j].classList.remove('big');
      host.classList.toggle('one', on); if (on) vp.classList.add('big');
      ev.currentTarget.setAttribute('data-i', on ? 'vMin' : 'vMax'); ev.currentTarget.textContent = T(on ? 'vMin' : 'vMax');
      var others = host.querySelectorAll('.vp-max'); for (j = 0; j < others.length; j++) if (others[j] !== ev.currentTarget) { others[j].setAttribute('data-i', 'vMax'); others[j].textContent = T('vMax'); }
      views.forEach(function (v) { v.dirty = true; }); requestFrame();
    });
    window.addEventListener('resize', function () { views.forEach(function (v) { v.dirty = true; }); drawResp(); requestFrame(); });
    if (window.ResizeObserver) new ResizeObserver(function () { views.forEach(function (v) { v.dirty = true; }); requestFrame(); }).observe($('vps'));
    if (!dl.local) { try { window.claude.use('downloads').then(function (ns) { dl.ns = ns; }, function () { dl.ns = null; }); } catch (e) { dl.ns = null; } }
    var tbs = document.querySelectorAll('.tab');
    for (i = 0; i < tbs.length; i++) tbs[i].addEventListener('click', function (ev) { setTab(ev.currentTarget.getAttribute('data-tab')); });
    Sheet.init({ st: st, cfg: function () { return LamCfg; }, setCfg: function (c) { LamCfg = c; }, changed: lamChanged, matInfo: matInfo, MATS: MATS, el: el, $: $,
      params: params, goTab: function (t) { setTab(t); }, plas: function (k) { return PlasCfg[k]; }, setPlas: setPlas, rub: function (k) { return RubCfg[k]; }, setRub: setRub, setMat: function (m) { setState('mat', m, true); },
      saveFile: function (name, txt, mime, title) { csvName = name; csvMime = mime; $('csvH').textContent = title; $('csvText').value = txt; $('csvMsg').textContent = ''; $('csvSave').hidden = !(dl.local || dl.ns); $('csvModal').hidden = false; $('csvText').focus(); } });
    Order.init();
    var mm = $('mo_mat'); mm.innerHTML = '';
    ['LAM'].concat(Object.keys(Spec.RUB), Object.keys(Spec.PLAS), ['SS400', 'S235', 'STS304', 'AL6061', 'custom']).forEach(function (k) { var op = el('option'); op.value = k; op.setAttribute('data-i', 'mat_' + k); mm.appendChild(op); });
    Motion.init({ st: st, $: $ });
    st.plasSig = JSON.stringify(PlasCfg);
    st.lamSig = JSON.stringify(LamCfg);
    document.body.setAttribute('data-tab', 'beam');
    lamSync(); applyTheme(); applyLang(); setTab(tab0);
    window.BeamBoard = { setTab: setTab, lam: function () { return LamCfg; }, lamChanged: lamChanged, state: st, result: function () { return res; }, set: setState, views: views, csv: csvText,
      redraw: function () { rebuild.s = rebuild.d = rebuild.c = rebuild.f = true; var t0 = performance.now(); frame(t0); return performance.now() - t0; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
