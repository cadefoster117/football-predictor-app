const historyData =
  JSON.parse(
    localStorage.getItem("history") || "[]"
  )

const container =
  document.getElementById("history")

if (!container) {
  console.warn("No #history element found in DOM")
} else {
  historyData.forEach(h => {
    const div = document.createElement("div")
    div.className = "card"
    div.innerHTML =
      "<h3>" + (h.match || "Unknown match") + "</h3>" +
      "<p>" + (h.result || "No result") + "</p>"
    container.appendChild(div)
  })
}
