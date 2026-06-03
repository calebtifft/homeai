import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../contexts/ThemeContext";
import { primaryOverlay, radius } from "../theme/curatedCanvas";

type BeforeAfterSliderProps = {
  originalUri: string;
  generatedUri: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function splitFromPageX(pageX: number, left: number, width: number): number {
  if (width <= 0) return 0.5;
  return clamp((pageX - left) / width, 0, 1);
}

export function BeforeAfterSlider({
  originalUri,
  generatedUri,
}: BeforeAfterSliderProps) {
  const { colors, typography, ambientShadow, ghostBorder, isDark } = useTheme();
  const [split, setSplit] = useState(0.5);
  const [cardW, setCardW] = useState(0);
  const cardRef = useRef<View>(null);
  const cardWRef = useRef(0);
  cardWRef.current = cardW;
  const gestureFrameRef = useRef({ left: 0, width: 0 });
  const pendingSplitRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const setSplitSmooth = (next: number) => {
    pendingSplitRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      if (pendingSplitRef.current == null) return;
      setSplit(pendingSplitRef.current);
    });
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          width: "100%",
          maxWidth: 400,
          alignSelf: "center",
          aspectRatio: 4 / 5,
          borderRadius: radius.xl,
          overflow: "hidden",
          backgroundColor: colors.surfaceContainer,
        },
        imageFull: {
          ...StyleSheet.absoluteFillObject,
          width: "100%",
          height: "100%",
        },
        beforeClip: {
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          overflow: "hidden",
        },
        divider: {
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 2,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.35)"
            : "rgba(251, 248, 254, 0.55)",
        },
        handle: {
          position: "absolute",
          top: "50%",
          marginTop: -20,
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isDark
            ? "rgba(40, 44, 36, 0.92)"
            : "rgba(251, 248, 254, 0.85)",
          alignItems: "center",
          justifyContent: "center",
          ...ambientShadow,
        },
        handleKnob: {
          width: 4,
          height: 18,
          borderRadius: 2,
          backgroundColor: colors.primary,
        },
        badge: {
          position: "absolute",
          bottom: 16,
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: radius.full,
        },
        badgeBefore: {
          left: 16,
          backgroundColor: "rgba(49, 50, 59, 0.55)",
        },
        badgeAfter: {
          right: 16,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.18)"
            : "rgba(251, 248, 254, 0.45)",
        },
        hintWrap: {
          position: "absolute",
          top: 12,
          left: 0,
          right: 0,
          alignItems: "center",
        },
        hint: {
          fontSize: 11,
          color: "#fafaf8",
          backgroundColor: primaryOverlay.o85,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.full,
          overflow: "hidden",
        },
      }),
    [colors, ambientShadow, ghostBorder, isDark]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const pageX = e.nativeEvent.pageX;
          cardRef.current?.measureInWindow((left, _top, w) => {
            const width = w > 0 ? w : cardWRef.current;
            gestureFrameRef.current = { left, width };
            if (width > 0) {
              setSplitSmooth(splitFromPageX(pageX, left, width));
            }
          });
        },
        onPanResponderMove: (e, g) => {
          const { left, width: w } = gestureFrameRef.current;
          if (w > 0) {
            setSplitSmooth(splitFromPageX(g.moveX, left, w));
            return;
          }
          const cw = cardWRef.current;
          if (cw > 0) {
            setSplitSmooth(clamp(e.nativeEvent.locationX / cw, 0, 1));
          }
        },
      }),
    []
  );

  const clipW = cardW * split;
  const dividerW = 2;
  const handleW = 36;
  const dividerLeft = clamp(clipW - dividerW / 2, 0, Math.max(0, cardW - dividerW));
  const handleLeft = clamp(clipW - handleW / 2, 0, Math.max(0, cardW - handleW));

  return (
    <View
      ref={cardRef}
      collapsable={false}
      style={[styles.card, ambientShadow, ghostBorder]}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setCardW(w);
        requestAnimationFrame(() => {
          cardRef.current?.measureInWindow((left, _top, mw) => {
            const width = mw > 0 ? mw : w;
            if (width > 0) gestureFrameRef.current = { left, width };
          });
        });
      }}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri: generatedUri }}
        style={styles.imageFull}
        resizeMode="contain"
        fadeDuration={0}
      />
      {cardW > 0 ? (
        <View style={[styles.beforeClip, { width: clipW }]}>
          <Image
            source={{ uri: originalUri }}
            style={[styles.imageFull, { width: cardW }]}
            resizeMode="contain"
            fadeDuration={0}
          />
        </View>
      ) : null}
      <View style={[styles.divider, { left: dividerLeft }]} />
      <View style={[styles.handle, { left: handleLeft }]}>
        <View style={styles.handleKnob} />
      </View>
      <View style={[styles.badge, styles.badgeBefore]} pointerEvents="none">
        <Text style={typography.badgeOnDark}>Before</Text>
      </View>
      <View style={[styles.badge, styles.badgeAfter]} pointerEvents="none">
        <Text style={typography.badgeLight}>After</Text>
      </View>
      <View style={styles.hintWrap} pointerEvents="none">
        <Text style={[typography.captionMedium, styles.hint]}>Drag to compare</Text>
      </View>
    </View>
  );
}
