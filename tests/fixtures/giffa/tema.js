// Krav: K36 i KRAV.md, beslut 0015. Test: tests/test_sajter.js.
// Projektets sajter laddar skriptet i <head>, utan defer, så att temat som besökaren
// valt med knappen i sajtraden (sajter.js) gäller innan sidan ritas. Valet delas av
// sajterna, som har samma värd. Utan val gäller läsarens inställning. En webbläsare
// utan light-dark() har bara ljust tema, och då gör skriptet ingenting.
(function () {
  if (!window.CSS || !CSS.supports("color", "light-dark(black, white)")) return;
  try {
    document.documentElement.dataset.tema = localStorage.getItem("sajter-tema") || "";
  } catch (e) {
    // En webbläsare som spärrat lagringen kastar ett fel; då gäller läsarens inställning.
  }
})();
