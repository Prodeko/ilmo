import type { ThemeConfig } from "antd"

const theme: ThemeConfig = {
  token: {
    fontSize: 16,
    fontFamily: "Raleway, sans-serif",
    colorPrimary: "#002e7d",
    colorText: "rgb(10, 10, 10)",
  },
  components: {
    Layout: {
      headerBg: "#fff",
      bodyBg: "#fff",
    },
  },
}

export default theme
