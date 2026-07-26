import Svg, { Path } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";

interface CodiusLogoProps {
  size?: number;
  color?: string;
}

/**
 * Compatibility export retained so upstream callers do not need to be renamed.
 * The rendered mark is the official Codius symbol.
 */
export function CodiusLogo({ size = 64, color }: CodiusLogoProps) {
  const { theme } = useUnistyles();
  const fill = color ?? theme.colors.foreground;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path d="M17.002 2H7C4.243 2 2 4.243 2 6.999v10.003C2 19.758 4.243 22 7 22h10.002C19.758 22 22 19.758 22 17.002V6.999C22 4.243 19.758 2 17.002 2ZM9.446 15.995c.553 0 1 .448 1 1s-.447 1-1 1H7c-.553 0-1-.448-1-1V7c0-.552.447-1 1-1h2.446c.553 0 1 .448 1 1s-.447 1-1 1H8v7.995h1.446ZM18 16.995c0 .552-.447 1-1 1h-2.446c-.553 0-1-.448-1-1s.447-1 1-1H16V8h-1.446c-.553 0-1-.448-1-1s.447-1 1-1H17c.553 0 1 .448 1 1v9.995Z" />
    </Svg>
  );
}
