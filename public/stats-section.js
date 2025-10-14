async function loadReadingStats() {
    try {
        // Global store'dan verileri al
        const allData = window.globalDataStore ? window.globalDataStore.getAllData() : { users: [], stats: [] };
        const summary = window.globalDataStore ? window.globalDataStore.getReadingStatsSummary() : [];

        // Create a map of all dates with status for each user
        const userDatesMap = {};

        // Initialize the map for each user
        for (const user of (allData.users || [])) {
            userDatesMap[user._id] = {};
        }

        // Fill in the map with actual statuses
        for (const stat of (allData.stats || [])) {
            if (!userDatesMap[stat.userId]) {
                userDatesMap[stat.userId] = {};
            }
            userDatesMap[stat.userId][stat.date] = stat.status;
        }

        // summary zaten okudum/okumadım içeriyor
        const enhancedUserStats = summary.map(item => ({
            userId: item.userId,
            name: item.name,
            profileImage: item.profileImage,
            okudum: item.okudum,
            okumadim: item.okumadim
        }));

        // Giriş yapılan kullanıcı bilgisini al
        const currentUserInfo = LocalStorageManager.getCurrentUserInfo();

        // Get the canvas element
        const ctx = document.getElementById('readingStatsChart');

        // Check if the canvas exists
        if (!ctx) {
            console.error('Chart canvas element not found');
            return;
        }

        // Kullanıcı sayısına göre yükseklik ayarla (ör: her kullanıcı için 45px)
        const chartContainer = ctx.parentElement;
        if (chartContainer) {
            const userHeight = 44;
            const dynamicHeight = Math.max(enhancedUserStats.length * userHeight+120);
            chartContainer.style.height = dynamicHeight + 'px';
        }

        // Prepare data for the chart
        const labels = enhancedUserStats.map(user => user.name);
        const okudumData = enhancedUserStats.map(user => user.okudum);
        const okumadimData = enhancedUserStats.map(user => user.okumadim);

        // Calculate success rates
        const successRates = enhancedUserStats.map(user => {
            const total = user.okudum + user.okumadim;
            return total > 0 ? Math.round((user.okudum / total) * 100) : 0;
        });

        // Find the highest success rate
        const highestSuccessRate = Math.max(...successRates);

        // Create background colors array based on success rates and current user
        const okudumBackgroundColors = enhancedUserStats.map((user, index) => {
            // If this is the current user, highlight with a special color
            if (currentUserInfo && currentUserInfo.userId === user.userId) {
                return 'rgba(40, 167, 69, 0.9)'; // Special green for current user
            }
            // If this user has the highest success rate, highlight with a more vibrant color
            return successRates[index] === highestSuccessRate
                ? 'rgba(76, 217, 99, 0.95)' // Brighter green for highest success rate
                : 'rgba(68, 206, 91, 0.79)'; // Regular green for others
        });

        // Create border colors array based on success rates and current user
        const okudumBorderColors = enhancedUserStats.map((user, index) => {
            // If this is the current user, highlight with a special border
            if (currentUserInfo && currentUserInfo.userId === user.userId) {
                return 'rgba(28, 147, 49, 1)'; // Special dark green border for current user
            }
            // If this user has the highest success rate, highlight with a thicker border
            return successRates[index] === highestSuccessRate
                ? 'rgba(50, 180, 80, 1)' // Darker green border for highest success rate
                : 'rgba(76, 217, 100, 1)'; // Regular green border for others
        });

        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            console.error('Chart.js is not loaded');
            return;
        }

        // Check if there's an existing chart instance
        if (window.readingStatsChart instanceof Chart) {
            window.readingStatsChart.destroy();
        }

        // Create the chart
        window.readingStatsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Okunan gün',
                        data: okudumData,
                        backgroundColor: okudumBackgroundColors,
                        borderColor: okudumBorderColors,
                        borderWidth: enhancedUserStats.map((user, index) =>
                            successRates[index] === highestSuccessRate ? 2 : 1
                        ),
                        hoverBackgroundColor: 'rgba(63, 194, 63, 0.9)'
                    },
                    {
                        label: 'Okunmayan gün',
                        data: okumadimData,
                        backgroundColor: 'rgba(255, 100, 60, 0.7)',
                        borderColor: 'rgba(255, 100, 60, 1)',
                        borderWidth: 1,
                        hoverBackgroundColor: 'rgba(255, 100, 60, 0.9)'
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 2200
                },
                layout: {
                    padding: {
                        top: 10,
                        bottom: 10,
                        left: 10,
                        right: 80
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Gün Sayısı',
                            color: '#000000',
                            font: {
                                weight: 'bold',
                                size: 16
                            },
                            padding: {
                                top: 18
                            }
                        },
                        ticks: {
                            color: '#000000',
                            font: {
                                size: 16
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        }
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Kullanıcılar',
                            color: '#000000',
                            font: {
                                weight: 'bold',
                                size: 15
                            },
                            padding: {
                                bottom: 15
                            }
                        },
                        ticks: {
                            color: '#000000',
                            font: {
                                size: 17
                            },
                            callback: function (value) {
                                const label = this.getLabelForValue(value);
                                return label.length > 12 ? label.slice(0, 12) + '...' : label;
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterBody: function (context) {
                                const index = context[0].dataIndex;
                                return `Başarı Oranı: %${successRates[index]}`;
                            }
                        },
                        titleColor: '#000000',
                        bodyColor: '#000000',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        borderColor: 'rgba(0, 0, 0, 0.2)',
                        borderWidth: 1
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#000000',
                            font: {
                                weight: 'bold',
                                size: 14
                            }
                        }
                    },
                    datalabels: {
                        display: function (context) {
                            // Sadece ilk dataset (Okudum) için göster
                            return context.datasetIndex === 0;
                        },
                        formatter: function (value, context) {
                            const index = context.dataIndex;
                            const successRate = successRates[index];
                            const isHighest = successRate === highestSuccessRate;
                            const isLowest = successRate === Math.min(...successRates);

                            if (isHighest) {
                                return `👑 %${successRate}`;
                            } else if (isLowest) {
                                return `💀 %${successRate}`;
                            } else {
                                return `%${successRate}`;
                            }
                        },
                        align: 'end',        // Çubuğun en sağına hizala
                        anchor: 'end',       // Çubuğun ucuna yerleştir
                        offset: 0,
                        rotation: 0,
                        color: '#000000',
                        backgroundColor: 'rgba(255, 244, 244, 0.9)',
                        borderColor: 'rgba(0, 0, 0, 0.2)',
                        borderWidth: 1.2,
                        borderRadius: 4,
                        font: {
                            weight: 'bold',
                            size: 15
                        },
                        padding: {
                            top: 4,
                            bottom: 4,
                            left: 6,
                            right: 6
                        },
                        z: 100
                    }
                }
            },
            plugins: [ChartDataLabels]
        });

        // Grafik başarıyla oluşturulduktan sonra statsLoadingSpinner'ı gizle
        const statsLoading = document.getElementById('stats-loading');
        if (statsLoading) statsLoading.style.display = 'none';

        // stats-section'ı görünür yap
        const statsSection = document.querySelector('.stats-section');
        if (statsSection) statsSection.style.display = 'block';
    } catch (error) {
        console.error('Error loading reading stats:', error);
    }
}