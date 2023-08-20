import {
    Comment,
    Context,
    Devvit,
    FormOnSubmitEvent,
    MenuItemOnPressEvent,
    Post,
    Subreddit,
} from '@devvit/public-api-next';

Devvit.configure({
    redditAPI: true,
    kvStore: true
});

const controlPanel = Devvit.createForm(
    {
        description: "Configure Nuke Parameters",
        acceptLabel: "Scan Modqueue",
        fields: [
            {
                type: "select",
                name: "itemType",
                label: "Item type to nuke",
                helpText: "Select the type of items you want to nuke",
                required: true,
                options: [
                    {
                        label: "All",
                        value: "all"
                    },
                    {
                        label: "Comments",
                        value: "comment"
                    },
                    {
                        label: "Posts",
                        value: "post"
                    },
                ]
            },
            {
                type: "group",
                label: "Item Filters",
                helpText: "Configure filters to only nuke items that match certain criteria",
                fields: [
                    {
                        type: "group",
                        label: "Score",
                        helpText: "If enabled, only items with a score lower than the specified value will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "checkScore",
                                label: "Check score?",
                            },
                            {
                                type: "number",
                                name: "maxScore",
                                label: "Maximum score",
                                required: false,
                                helpText: "Only remove items with a score lower than this value. Ignored if 'Check score?' is off."
                            }
                        ]
                    },
                    {
                        type: "group",
                        label: "Age",
                        helpText: "If enabled, only items older than the specified age (in hours) will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "checkAge",
                                label: "Check age?",
                            },
                            {
                                type: "number",
                                name: "minAge",
                                label: "Minimum age",
                                required: false,
                                helpText: "Only nuke items older than this value (in hours). Ignored if 'Check age?' is off."
                            }
                        ]
                    },
                    {
                        type: "group",
                        label: "Reports",
                        helpText: "If enabled, only items with a number of reports higher than the specified value will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "checkReports",
                                label: "Check reports?",
                            },
                            {
                                type: "number",
                                name: "minReports",
                                label: "Minimum reports",
                                required: false,
                                helpText: "Only remove items with a number of reports higher than this value. Ignored if 'Check reports?' is off."
                            }]
                    },
                    {
                        type: "boolean",
                        name: "ignoreSticky",
                        label: "Ignore sticky posts",
                        helpText: "If enabled, sticky posts will be ignored."
                    },
                    {
                        type: "boolean",
                        name: "ignorePreviouslyApproved",
                        label: "Ignore previously approved items",
                        helpText: "If enabled, items that have been previously approved by a moderator will be ignored."
                    },
                    {
                        type: "boolean",
                        name: "ignoreModerator",
                        label: "Ignore moderator items",
                        helpText: "If enabled, items that have been posted by a moderator will be ignored."
                    },
                ]
            }
        ],
        title: "Nuke Control Panel"
    },
    scanModqueue
)

async function nukeItems(_event: FormOnSubmitEvent, context: Context) {
    const {
        reddit,
        kvStore,
        userId,
        ui
    } = context
    const itemIds: Array<string> | undefined = await kvStore.get(`${userId}_itemsToRemove`)
    const itemsToRemove: ModqueueItem[] = []
    if (itemIds === undefined) {
        log(context, "No items to remove")
        return;
    }
    for (const id of itemIds) {
        if (id.startsWith("t1_")) {
            itemsToRemove.push(await reddit.getCommentById(id));
        } else {
            itemsToRemove.push(await reddit.getPostById(id));
        }
    }
    log(context, `Nuking ${itemsToRemove.length} items...`)
    let removedPostCount = 0;
    let removedCommentCount = 0;
    let failedItemCount = 0;
    for (const item of itemsToRemove) {
        try {
            await item.remove(false)
            if (item instanceof Comment) {
                removedCommentCount++;
            } else {
                removedPostCount++;
            }
        } catch (e) {
            log(context, `Error while removing ${item.permalink} by u/${item.authorName}`)
            console.error(`${e}`)
            failedItemCount++;
        }
    }
    if (removedPostCount + removedCommentCount != 0) {
        log(context, `Successfully nuked ${removedCommentCount + removedPostCount} items ${generateItemCounts({
            name: "Posts",
            count: removedPostCount
        }, {
            name: "Comments",
            count: removedCommentCount
        })}`);
    }
    if (failedItemCount > 0) {
        let message = `Failed to remove ${failedItemCount} items`
        console.error(message)
        ui.showToast({
            text: message,
            appearance: "neutral"
        })
    }
}


const nukeForm = Devvit.createForm(
    (data) => (
        {
            fields: [],
            title: "Confirm Nuke",
            acceptLabel: "Nuke!",
            description: data.description,
        }),
    nukeItems
);

Devvit.addMenuItem(
    {
        description: 'Nuke (remove) items in the modqueue',
        forUserType: "moderator",
        label: 'Nuke Modqueue',
        location: ["subreddit"],
        onPress: (_event: MenuItemOnPressEvent, context) => {
            context.ui.showForm(controlPanel)
        },
    }
);

interface GenerateItemCountsParams {
    name: string;
    count?: number;
    value?: string;
}

function generateItemCounts(...items: GenerateItemCountsParams[]) {
    let itemsCounts = '';
    let elements: string[] = []
    items.forEach((item) => {
        if (item.count != undefined) {
            if (item.count > 0) {
                elements.push(`${item.name}: ${item.count}`)
            }
        } else if (item.value != undefined) {
            if (item.value != "") {
                elements.push(`${item.name}: ${item.value}`)
            }
        }
    })
    if (elements.length > 0) {
        itemsCounts = `(${elements.join(', ')})`
    }
    return itemsCounts;
}

type ModqueueItem = Comment | Post;

interface CheckParams {
    target: ModqueueItem;
    failureMessage: (target: ModqueueItem) => string;
    checkFunc: (target: ModqueueItem) => boolean;
}

function check({
                   target,
                   checkFunc,
                   failureMessage
               }: CheckParams): boolean {
    const itemType = target.constructor.name.toLowerCase()
    const baseString = `Skipping ${itemType} id: ${target.id.split('_')[1]} by u/${target.authorName} because`;
    const shouldRemove = checkFunc(target);
    if (!shouldRemove) {
        console.log(`${baseString} ${failureMessage(target)}`)
    }
    return shouldRemove
}

async function scanModqueue(event: FormOnSubmitEvent, context: Context) {
    const {
        reddit,
        kvStore
    } = context;
    const subreddit: Subreddit = await reddit.getCurrentSubreddit()
    const {
        checkAge,
        checkScore,
        checkReports,
        ignoreModerator,
        ignorePreviouslyApproved,
        ignoreSticky,
        itemType,
        maxScore,
        minAge,
        minReports,

    } = event.values;
    if (itemType == undefined) {
        context.ui.showToast({
            text: "You must select a type of item to remove",
            appearance: "neutral"
        })
        return;
    }
    log(context, `Scanning modqueue...`)
    let itemsToRemove: ModqueueItem[] = [];
    let commentCount = 0;
    let postCount = 0;
    try {
        await subreddit.getModQueue({type: itemType[0]}).all().then(async (items: (ModqueueItem)[]) => {
            for (const item of items) {
                if (checkScore && !check({
                    target: item,
                    checkFunc: (target) => target.score <= maxScore,
                    failureMessage: (target) => `the score is too high ${generateItemCounts({
                        name: "Score",
                        count: target.score
                    })}`
                })) continue;
                if (checkAge && !check({
                    target: item,
                    checkFunc: (target) => target.createdAt.getMilliseconds() <= (Date.now() - (minAge * 60 * 60 * 1000)),
                    failureMessage: (target) => `the ${itemType} isn't old enough ${generateItemCounts({
                        name: "Age",
                        value: formatAge(target)
                    })}`
                })) continue;
                if (checkReports) {
                    let reportCount = item instanceof Comment ? item.numReports : item.numberOfReports;
                    if (!check({
                        target: item,
                        checkFunc: (_target) => reportCount >= minReports,
                        failureMessage: (_target) => `reports are too low ${generateItemCounts({
                            name: "Reports",
                            count: reportCount
                        })}`
                    })) continue;
                }
                if (ignoreSticky && !check({
                    target: item,
                    checkFunc: (target) => target.isStickied(),
                    failureMessage: (_target) => `it is stickied`
                })) continue;
                if (ignorePreviouslyApproved && !check({
                    target: item,
                    checkFunc: (target) => target.isStickied(),
                    failureMessage: (_target) => `it was previously approved`
                })) continue;
                if (ignoreModerator && !check({
                    target: item,
                    checkFunc: (target) => subreddit.getModerators({username: target.authorName}).pageSize !== undefined,
                    failureMessage: (_target) => `the author is a moderator`
                })) continue;
                item instanceof Post ? postCount++ : commentCount++;
                itemsToRemove.push(item)
            }
        })
        if (itemsToRemove.length == 0) {
            log(context, `No items to nuke`)
            return;
        }
        await kvStore.put(`${context.userId}_itemsToRemove`, itemsToRemove.map((item) => item.id))
        let description = `Found ${itemsToRemove.length}`
        if (itemsToRemove.length == 1) {
            description += ` ${itemsToRemove[0].constructor.name.toLowerCase()} to nuke`
        } else {
            description += ` items to nuke ${generateItemCounts({
                    name: "Posts",
                    count: postCount
                },
                {
                    name: "Comments",
                    count: commentCount
                })}`
        }
        description += `. Are you sure you want to nuke these items?`
        context.ui.showForm(nukeForm, {
                description: description
            }
        )

    } catch (e) {
        context.ui.showToast({
            text: 'An error occurred scanning the modqueue items',
            appearance: "neutral"
        })
        console.error(`${e}`, e)
    }
}

function log(context: Context, message: string) {
    console.log(message)
    context.ui.showToast(message)
}

function formatAge({createdAt}: ModqueueItem): string {
    // @ts-ignore
    const ageInSeconds = (new Date() - createdAt) / 1000
    const seconds = ageInSeconds % 60;
    const minutes = Math.floor(ageInSeconds / 60) % 60;
    const hours = Math.floor(ageInSeconds / 3600) % 24;
    const days = Math.floor(ageInSeconds / 86400);

    let ageString = '';
    if (days > 0) {
        ageString += `${days} day${days === 1 ? '' : 's'} `;
    }
    if (hours > 0 && days < 2) {
        if (ageString != '') {
            ageString += ', ';
        }
        ageString += `${hours} hour${hours === 1 ? '' : 's'} `;
    }
    if (minutes > 0 && days === 0 && hours === 0) {
        if (ageString != '') {
            ageString += ', ';
        }
        ageString += `${minutes} minute${minutes === 1 ? '' : 's'} `;
    }
    if (seconds > 0 && days === 0 && hours === 0 && minutes === 0) {
        if (ageString != '') {
            ageString += ', ';
        }
        ageString += `${seconds} second${seconds === 1 ? '' : 's'} `;
    }
    ageString += 'ago';
    return ageString.trim();
}

// noinspection JSUnusedGlobalSymbols
export default Devvit;
