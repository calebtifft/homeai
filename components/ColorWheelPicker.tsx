import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from "react-native-svg";
import { useLanguage } from "../contexts/LanguageContext";
import { useTheme } from "../contexts/ThemeContext";
import { Manrope, radius } from "../theme/curatedCanvas";

const WHEEL_SIZE = 260;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
const SLICES = 60;
const THUMB_SIZE = 18;

const SLIDER_HEIGHT = 18;
const SLIDER_THUMB = 22;

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hp >= 0 && hp < 1) [rp, gp, bp] = [c, x, 0];
  else if (hp < 2) [rp, gp, bp] = [x, c, 0];
  else if (hp < 3) [rp, gp, bp] = [0, c, x];
  else if (hp < 4) [rp, gp, bp] = [0, x, c];
  else if (hp < 5) [rp, gp, bp] = [x, 0, c];
  else if (hp < 6) [rp, gp, bp] = [c, 0, x];
  const m = v - c;
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

function hsvToHex(h: number, s: number, v: number): string {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const cleaned = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
  const r = parseInt(cleaned.slice(0, 2), 16) / 255;
  const g = parseInt(cleaned.slice(2, 4), 16) / 255;
  const b = parseInt(cleaned.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

function polarToCartesian(h: number, s: number) {
  const angle = (h * Math.PI) / 180;
  const distance = s * WHEEL_RADIUS;
  return {
    x: WHEEL_RADIUS + distance * Math.cos(angle),
    y: WHEEL_RADIUS + distance * Math.sin(angle),
  };
}

function cartesianToHsv(x: number, y: number) {
  const dx = x - WHEEL_RADIUS;
  const dy = y - WHEEL_RADIUS;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const s = Math.min(dist / WHEEL_RADIUS, 1);
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return { h: angle, s };
}

function buildSlicePath(i: number): string {
  const startDeg = (i / SLICES) * 360;
  const endDeg = ((i + 1) / SLICES) * 360;
  const startRad = (startDeg * Math.PI) / 180;
  const endRad = (endDeg * Math.PI) / 180;
  const x1 = WHEEL_RADIUS + WHEEL_RADIUS * Math.cos(startRad);
  const y1 = WHEEL_RADIUS + WHEEL_RADIUS * Math.sin(startRad);
  const x2 = WHEEL_RADIUS + WHEEL_RADIUS * Math.cos(endRad);
  const y2 = WHEEL_RADIUS + WHEEL_RADIUS * Math.sin(endRad);
  return `M ${WHEEL_RADIUS} ${WHEEL_RADIUS} L ${x1} ${y1} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${x2} ${y2} Z`;
}

const SLICE_PATHS = Array.from({ length: SLICES }, (_, i) => ({
  d: buildSlicePath(i),
  fill: hsvToHex(((i + 0.5) / SLICES) * 360, 1, 1),
}));

type ColorWheelPickerProps = {
  visible: boolean;
  initialHex?: string;
  onCancel: () => void;
  onConfirm: (hex: string) => void;
};

export function ColorWheelPicker({
  visible,
  initialHex,
  onCancel,
  onConfirm,
}: ColorWheelPickerProps) {
  const { colors, isDark, typography, ambientShadow } = useTheme();
  const { t } = useLanguage();

  const initial = useMemo(() => {
    const parsed = initialHex ? hexToHsv(initialHex) : null;
    return parsed ?? { h: 0, s: 0, v: 1 };
  }, [initialHex]);

  const [hue, setHue] = useState<number>(initial.h);
  const [sat, setSat] = useState<number>(initial.s);
  const [val, setVal] = useState<number>(initial.v);
  const [sliderWidth, setSliderWidth] = useState<number>(0);
  const sliderWidthRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setHue(initial.h);
      setSat(initial.s);
      setVal(initial.v);
    }
  }, [visible, initial.h, initial.s, initial.v]);

  const hex = useMemo(() => hsvToHex(hue, sat, val), [hue, sat, val]);
  const thumb = useMemo(() => polarToCartesian(hue, sat), [hue, sat]);

  const handleWheel = useCallback((x: number, y: number) => {
    const { h, s } = cartesianToHsv(x, y);
    setHue(h);
    setSat(s);
  }, []);

  const wheelResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) =>
        handleWheel(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
      onPanResponderMove: (evt) =>
        handleWheel(evt.nativeEvent.locationX, evt.nativeEvent.locationY),
    })
  ).current;

  const handleSlider = useCallback((x: number) => {
    const width = sliderWidthRef.current;
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    setVal(ratio);
  }, []);

  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (evt) => handleSlider(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => handleSlider(evt.nativeEvent.locationX),
    })
  ).current;

  const fullColor = useMemo(() => hsvToHex(hue, sat, 1), [hue, sat]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        },
        card: {
          width: "100%",
          maxWidth: 360,
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          paddingTop: 18,
          paddingHorizontal: 18,
          paddingBottom: 16,
        },
        headerRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        },
        title: {
          color: colors.onSurface,
          flex: 1,
        },
        previewWrap: {
          alignItems: "center",
          gap: 4,
        },
        previewSwatch: {
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255,255,255,0.22)"
            : "rgba(0,0,0,0.14)",
        },
        previewHex: {
          color: colors.onSurfaceVariant,
          fontFamily: Manrope.semiBold,
          fontSize: 11,
          letterSpacing: 0.4,
        },
        wheelWrap: {
          width: WHEEL_SIZE,
          height: WHEEL_SIZE,
          alignSelf: "center",
          marginTop: 4,
          marginBottom: 14,
        },
        wheelTouch: {
          ...StyleSheet.absoluteFillObject,
        },
        thumb: {
          position: "absolute",
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          borderWidth: 3,
          borderColor: "#FFFFFF",
        },
        sliderWrap: {
          marginBottom: 18,
        },
        sliderArea: {
          height: SLIDER_THUMB + 4,
          justifyContent: "center",
        },
        sliderTrack: {
          height: SLIDER_HEIGHT,
          borderRadius: SLIDER_HEIGHT / 2,
          overflow: "hidden",
        },
        sliderGradient: {
          ...StyleSheet.absoluteFillObject,
        },
        sliderThumb: {
          position: "absolute",
          top: (SLIDER_THUMB + 4 - SLIDER_THUMB) / 2,
          width: SLIDER_THUMB,
          height: SLIDER_THUMB,
          borderRadius: SLIDER_THUMB / 2,
          borderWidth: 2,
          borderColor: "#FFFFFF",
        },
        sliderLabel: {
          color: colors.onSurfaceVariant,
          marginBottom: 6,
          fontFamily: Manrope.semiBold,
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        },
        actions: {
          flexDirection: "row",
          gap: 10,
        },
        actionBtn: {
          flex: 1,
          paddingVertical: 14,
          borderRadius: radius.full,
          alignItems: "center",
          justifyContent: "center",
        },
        cancelBtn: {
          backgroundColor: colors.surfaceContainerLow,
          borderWidth: 1,
          borderColor: colors.surfaceContainerHigh,
        },
        confirmBtn: {
          backgroundColor: colors.primary,
        },
        cancelText: {
          color: colors.onSurface,
          fontFamily: Manrope.semiBold,
        },
        confirmText: {
          color: colors.onPrimary,
          fontFamily: Manrope.semiBold,
        },
      }),
    [colors, isDark]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={[styles.card, ambientShadow]} onPress={() => {}}>
          <View style={styles.headerRow}>
            <Text style={[typography.title, styles.title]}>
              {t("colorWheel.title")}
            </Text>
            <View style={styles.previewWrap}>
              <View
                style={[styles.previewSwatch, { backgroundColor: hex }]}
              />
              <Text style={styles.previewHex}>{hex}</Text>
            </View>
          </View>

          <View style={styles.wheelWrap}>
            <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
              <Defs>
                <RadialGradient
                  id="satFade"
                  cx="50%"
                  cy="50%"
                  rx="50%"
                  ry="50%"
                >
                  <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={1} />
                  <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              {SLICE_PATHS.map((s, i) => (
                <Path key={i} d={s.d} fill={s.fill} />
              ))}
              <Circle
                cx={WHEEL_RADIUS}
                cy={WHEEL_RADIUS}
                r={WHEEL_RADIUS}
                fill="url(#satFade)"
              />
              {val < 1 ? (
                <Circle
                  cx={WHEEL_RADIUS}
                  cy={WHEEL_RADIUS}
                  r={WHEEL_RADIUS}
                  fill="#000000"
                  fillOpacity={1 - val}
                />
              ) : null}
            </Svg>
            <View style={styles.wheelTouch} {...wheelResponder.panHandlers} />
            <View
              pointerEvents="none"
              style={[
                styles.thumb,
                {
                  left: thumb.x - THUMB_SIZE / 2,
                  top: thumb.y - THUMB_SIZE / 2,
                  backgroundColor: hex,
                },
              ]}
            />
          </View>

          <View style={styles.sliderWrap}>
            <Text style={styles.sliderLabel}>{t("colorWheel.brightness")}</Text>
            <View
              style={styles.sliderArea}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                sliderWidthRef.current = w;
                setSliderWidth(w);
              }}
              {...sliderResponder.panHandlers}
            >
              <View style={styles.sliderTrack}>
                <LinearGradient
                  colors={["#000000", fullColor] as readonly [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sliderGradient}
                />
              </View>
              {sliderWidth > 0 ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.sliderThumb,
                    {
                      backgroundColor: hex,
                      left: Math.max(
                        0,
                        Math.min(
                          sliderWidth - SLIDER_THUMB,
                          val * sliderWidth - SLIDER_THUMB / 2
                        )
                      ),
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.cancelBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[typography.label, styles.cancelText]}>
                {t("colorWheel.cancel")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(hex)}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.confirmBtn,
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[typography.label, styles.confirmText]}>
                {t("colorWheel.confirm")}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
