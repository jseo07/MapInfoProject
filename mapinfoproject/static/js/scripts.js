document.addEventListener('DOMContentLoaded', () => {
  const navToggle = document.getElementById('nav-toggle');
  const menu      = document.getElementById('navbar-menu');
  const navbar    = document.querySelector('.navbar');
  const logo   = document.getElementById('logo-img');

  if (navToggle && menu) {
    navToggle.addEventListener('click', () => {
      menu.classList.toggle('active');
    });
  }

  const updateNavbar = () => {
    if (window.scrollY > 0) {
      navbar.classList.add('scrolled');
      logo.src = logo.dataset.srcScrolled;
    } else {
      navbar.classList.remove('scrolled');
      logo.src = logo.dataset.srcTop;

    }
  };

  window.addEventListener('scroll', updateNavbar);
  updateNavbar();
});
