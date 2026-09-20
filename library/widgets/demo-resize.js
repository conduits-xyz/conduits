(() => {
  const report = () => window.parent.postMessage({
    type: 'conduits-widget-demo-size',
    height: document.body.scrollHeight,
  }, '*')

  new ResizeObserver(report).observe(document.body)
  window.addEventListener('message', (event) => {
    if (event.data?.type === 'conduits-widget-demo-size-request') report()
  })
  report()
})()
