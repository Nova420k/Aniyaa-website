(function () {
  try {
    var stored = localStorage.getItem("aniyaa-theme");
    var dark =
      stored === "dark" ||
      (stored !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
