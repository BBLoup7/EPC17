/**
 * Achievement Manager for Snowmobile Racing Event Manager
 * Handles achievement calculation, award logic, and display
 */

class AchievementManager {
    constructor() {
        console.log('🏆 Initializing Achievement Manager');
        this.baseUrl = this.getBaseUrl();
        
        // Achievement tag definitions
        this.achievementTags = {
            'lane-bias-index': {
                title: '🧨 Lane Bias Index',
                description: 'Which lane wins more than it should? Assigned if a driver wins primarily from a lane that statistically underperforms',
                rarity: 'rare',
                category: 'performance'
            },
            'anti-social-racer': {
                title: '🧍‍♂️ Anti-Social Racer',
                description: 'Fewest unique opponents - This driver keeps drawing the same people round after round',
                rarity: 'common',
                category: 'social'
            },
            'bracket-comeback': {
                title: '🎯 Bracket Comeback of the Day',
                description: 'Deepest lower-bracket run - Dropped early, then climbed all the way to the final',
                rarity: 'epic',
                category: 'comeback'
            },
            'rematch-count': {
                title: '🔁 Rematch Count',
                description: 'Most rematches in a single event - They just couldn\'t get away from their rivals',
                rarity: 'common',
                category: 'social'
            },
            'silent-killer': {
                title: '🔪 Silent Killer',
                description: 'Most eliminations, no podium - Took out a lot of racers without placing',
                rarity: 'rare',
                category: 'eliminator'
            },
            'lane-loyalty-violation': {
                title: '😬 Lane Loyalty Violation',
                description: 'Never raced in the same lane twice - Switched lanes every single heat',
                rarity: 'common',
                category: 'consistency'
            },
            'clean-sweep': {
                title: '🧹 Clean Sweep',
                description: 'Perfect upper-bracket run - Won every match without ever dropping',
                rarity: 'legendary',
                category: 'dominance'
            },
            'unbreakable-wall': {
                title: '🧱 Unbreakable Wall',
                description: 'Eliminated the most opponents - Statistically the biggest threat on the bracket',
                rarity: 'epic',
                category: 'eliminator'
            },
            'luckiest-draw': {
                title: '🍀 Luckiest Draw',
                description: 'No rematches + preferred lane usage - Had the smoothest possible bracket run',
                rarity: 'rare',
                category: 'luck'
            }
        };
    }

    /**
     * Get base URL for API calls
     */
    getBaseUrl() {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        return `${protocol}//${hostname}${port ? ':' + port : ''}`;
    }

    /**
     * Load achievements for a specific participant
     */
    async loadParticipantAchievements(participantId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/achievements?participantId=${participantId}`);
            const achievements = await response.json();
            return achievements;
        } catch (error) {
            console.error('Error loading participant achievements:', error);
            return [];
        }
    }

    /**
     * Load all achievements
     */
    async loadAllAchievements() {
        try {
            const response = await fetch(`${this.baseUrl}/api/achievements`);
            const achievements = await response.json();
            return achievements;
        } catch (error) {
            console.error('Error loading achievements:', error);
            return [];
        }
    }

    /**
     * Calculate and award achievements for an event
     */
    async calculateEventAchievements(eventId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/calculate-achievements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ eventId })
            });

            const result = await response.json();
            
            if (result.success) {
                console.log(`🏆 Achievement calculation completed for event ${eventId}:`);
                console.log(`   - New achievements awarded: ${result.newAchievements}`);
                return result;
            } else {
                throw new Error(result.error || 'Achievement calculation failed');
            }
        } catch (error) {
            console.error('Error calculating achievements:', error);
            throw error;
        }
    }

    /**
     * Manually award an achievement to a participant
     */
    async awardAchievement(participantId, tagId, eventId = '', details = '') {
        try {
            const response = await fetch(`${this.baseUrl}/api/achievements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    participantId,
                    tagId,
                    eventId,
                    details
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                console.log(`🏆 Achievement awarded: ${tagId} to participant ${participantId}`);
                return result;
            } else {
                throw new Error(result.error || 'Failed to award achievement');
            }
        } catch (error) {
            console.error('Error awarding achievement:', error);
            throw error;
        }
    }

    /**
     * Generate achievement display HTML
     */
    generateAchievementHTML(achievements) {
        if (!achievements || achievements.length === 0) {
            return '<div class="no-achievements">No achievements earned yet</div>';
        }

        const sortedAchievements = achievements.sort((a, b) => 
            new Date(b.earnedDate) - new Date(a.earnedDate)
        );

        return sortedAchievements.map(achievement => {
            const tagInfo = this.achievementTags[achievement.tagId];
            if (!tagInfo) return '';

            const emoji = tagInfo.title.split(' ')[0];
            const title = tagInfo.title.substring(tagInfo.title.indexOf(' ') + 1);
            const earnedDate = new Date(achievement.earnedDate).toLocaleDateString();
            
            return `
                <div class="achievement-tag ${tagInfo.rarity}" data-tag-id="${achievement.tagId}">
                    <span class="achievement-emoji">${emoji}</span>
                    <span class="achievement-title">${title}</span>
                    <div class="achievement-tooltip">
                        <div>${tagInfo.description}</div>
                        <div class="achievement-details">
                            Earned: ${earnedDate}
                            ${achievement.details ? `<br>Details: ${achievement.details}` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Show achievement notification
     */
    showAchievementNotification(achievements, participants = []) {
        if (!achievements || achievements.length === 0) return;

        const notification = document.createElement('div');
        notification.className = 'achievement-notification';
        notification.innerHTML = `
            <div class="notification-header">
                <h4>🏆 New Achievements Earned!</h4>
                <button onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
            <div class="notification-body">
                ${achievements.map(achievement => {
                    const tagInfo = this.achievementTags[achievement.tagId];
                    const participant = participants.find(p => p.id === achievement.participantId);
                    return `
                        <div class="achievement-notification-item">
                            <strong>${participant?.name || 'Unknown Driver'}</strong> earned 
                            <strong>${tagInfo?.title || achievement.tagId}</strong>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }

    /**
     * Get achievement statistics
     */
    getAchievementStats(achievements) {
        const stats = {
            total: achievements.length,
            byRarity: {
                common: 0,
                rare: 0,
                epic: 0,
                legendary: 0
            },
            byCategory: {},
            recentAchievements: []
        };

        achievements.forEach(achievement => {
            const tagInfo = this.achievementTags[achievement.tagId];
            if (tagInfo) {
                stats.byRarity[tagInfo.rarity]++;
                
                if (!stats.byCategory[tagInfo.category]) {
                    stats.byCategory[tagInfo.category] = 0;
                }
                stats.byCategory[tagInfo.category]++;
            }
        });

        // Get recent achievements (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        stats.recentAchievements = achievements.filter(achievement => 
            new Date(achievement.earnedDate) > thirtyDaysAgo
        ).sort((a, b) => new Date(b.earnedDate) - new Date(a.earnedDate));

        return stats;
    }

    /**
     * Get all achievement definitions
     */
    getAllAchievementTags() {
        return this.achievementTags;
    }

    /**
     * Get achievement tag by ID
     */
    getAchievementTag(tagId) {
        return this.achievementTags[tagId] || null;
    }

    /**
     * Export achievement data for backup
     */
    async exportAchievements() {
        try {
            const achievements = await this.loadAllAchievements();
            const exportData = {
                achievements,
                achievementTags: this.achievementTags,
                exportDate: new Date().toISOString(),
                version: '1.0'
            };
            
            return exportData;
        } catch (error) {
            console.error('Error exporting achievements:', error);
            throw error;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AchievementManager;
} else {
    window.AchievementManager = AchievementManager;
} 