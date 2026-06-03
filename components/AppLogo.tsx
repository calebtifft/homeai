import { Image, StyleSheet, View } from "react-native";

const LOGO = require("../assets/icon.png");

/** App mark from `assets/icon.png` (Expo / store icon asset). */
export function AppLogo() {
  return (
    <View
      style={styles.wrap}
      accessibilityRole="image"
      accessibilityLabel="HomeAI"
    >
      <Image source={LOGO} style={styles.image} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  image: {
    width: 96,
    height: 96,
  },
});
