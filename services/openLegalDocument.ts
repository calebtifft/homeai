import * as WebBrowser from "expo-web-browser";
import { Alert, Linking } from "react-native";
import type { LegalDocumentId } from "../constants/legalUrls";
import { getLegalDocumentUrl } from "../constants/legalUrls";

export async function openLegalDocument(
  id: LegalDocumentId,
  opts?: { unavailableTitle?: string; unavailableBody?: string }
): Promise<void> {
  const url = getLegalDocumentUrl(id);
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      enableBarCollapsing: true,
    });
  } catch {
    try {
      const can = await Linking.canOpenURL(url);
      if (can) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      /* fall through */
    }
    if (opts?.unavailableTitle && opts?.unavailableBody) {
      Alert.alert(opts.unavailableTitle, opts.unavailableBody);
    }
  }
}
