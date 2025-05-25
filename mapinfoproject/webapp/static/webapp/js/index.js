document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.hero-nav__btn');
  const panels  = document.querySelectorAll('.section-content');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // 1) Toggle active state on buttons
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 2) Show/hide panels
      const targetId = btn.dataset.target;
      panels.forEach(panel => {
        if (panel.id === targetId) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });

      // 3) Smoothly scroll the newly-shown panel into view
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    });
  });
});






