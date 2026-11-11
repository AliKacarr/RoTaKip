(function initializeLeagueConfig() {
    const leagues = [
        { min: 0, max: 5, name: 'Bronz', img: 'bronz.webp', color1: '#e2b07a', color2: '#ffe0b2' },
        { min: 5, max: 10, name: 'Gümüş', img: 'gumus.webp', color1: '#d3d3d3', color2: '#e0e0e0' },
        { min: 10, max: 20, name: 'Altın', img: 'altin.webp', color1: '#ffd700', color2: '#ffe789' },
        { min: 20, max: 40, name: 'İnci', img: 'inci.webp', color1: '#b2dfdb', color2: '#c8eef3' },
        { min: 40, max: 60, name: 'Safir', img: 'safir.webp', color1: '#49b7ff', color2: '#bbdefb' },
        { min: 60, max: 100, name: 'Zümrüt', img: 'zumrut.webp', color1: '#58c089', color2: '#a5d6a7' },
        { min: 100, max: 150, name: 'Elmas', img: 'elmas.webp', color1: '#36e873', color2: '#c4edb8' },
        { min: 150, max: 200, name: 'Yakut', img: 'yakut.webp', color1: '#ffb199', color2: '#ffe0b2' },
        { min: 200, max: 365, name: 'Mercan', img: 'mercan.webp', color1: '#ff6f63', color2: '#ffafb7' },
        { min: 365, max: 1001, name: 'Pırlanta', img: 'pirlanta.webp', color1: '#ffbf00', color2: '#ffe789' }
    ].map(function (league) {
        return Object.freeze({
            ...league,
            bg: `linear-gradient(90deg, ${league.color1} 60%, ${league.color2} 100%)`
        });
    });

    window.ROTAKIP_LEAGUES = Object.freeze(leagues);
})();
