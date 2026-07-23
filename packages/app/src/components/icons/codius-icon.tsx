import Svg, { Path } from "react-native-svg";

interface CodiusIconProps {
  size?: number;
  color?: string;
}

export function CodiusIcon({ size = 16, color = "currentColor" }: CodiusIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.002 2H7C4.243 2 2 4.243 2 6.999v10.003C2 19.758 4.243 22 7 22h10.002C19.758 22 22 19.758 22 17.002V6.999C22 4.243 19.758 2 17.002 2ZM9.446 15.995c.553 0 1 .448 1 1s-.447 1-1 1H7c-.553 0-1-.448-1-1V7c0-.552.447-1 1-1h2.446c.553 0 1 .448 1 1s-.447 1-1 1H8v7.995h1.446ZM18 16.995c0 .552-.447 1-1 1h-2.446c-.553 0-1-.448-1-1s.447-1 1-1H16V8h-1.446c-.553 0-1-.448-1-1s.447-1 1-1H17c.553 0 1 .448 1 1v9.995Z" />
    </Svg>
  );
}
