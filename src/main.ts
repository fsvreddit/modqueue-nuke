import {
    BaseContext,
    Comment,
    Context,
    ContextAPIClients,
    Devvit,
    FormOnSubmitEvent,
    MenuItemOnPressEvent,
    Post,
    RedditAPIClient,
    Subreddit,
    User,
} from "@devvit/public-api";

type ModqueueItem = Comment | Post;

interface ActionItem {
    items: ModqueueItem[];
    action: (item: (Post | Comment)) => Promise<void>;
    actionName: string;
}

interface ActionResult {
    commentCount: number;
    failedCount: number;
    postCount: number;
}

interface CheckParams {
    checkFunc: (target: ModqueueItem) => Promise<boolean>;
    failureMessage: (target: ModqueueItem) => string;
    target: ModqueueItem;
}

interface GenerateItemCountsParams {
    name: string;
    count?: number;
    value?: string;
}

interface LogAction {
    actionName: string;
    commentCount: number;
    postCount: number;
}


const nukeForm = Devvit.createForm(
    (data) => (
        {
            fields: [],
            title: "Confirm Nuke",
            acceptLabel: "Nuke!",
            description: data.description,
        }
    ),
    nukeItems,
);

Devvit.configure({
    redditAPI: true,
    redis: true,
});

Devvit.addMenuItem(
    {
        description: "Nuke items in the modqueue",
        forUserType: "moderator",
        label: "Nuke Modqueue",
        location: ["subreddit"],
        onPress: (_event: MenuItemOnPressEvent, context) => {
            context.ui.showForm(controlPanel)
        },
    },
);

const controlPanel = Devvit.createForm(
    {
        description: "Configure Nuke Parameters",
        acceptLabel: "Scan Modqueue",
        fields: [
            {
                type: "select",
                name: "itemType",
                label: "Item Type",
                helpText: "Select the type of items you want to nuke",
                required: true,
                defaultValue: ["all"],
                options: [
                    {
                        label: "All",
                        value: "all",
                    },
                    {
                        label: "Comments",
                        value: "comment",
                    },
                    {
                        label: "Posts",
                        value: "post",
                    },
                ],
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
                                label: "Check Score?",
                            },
                            {
                                type: "number",
                                name: "maxScore",
                                label: "Maximum Score",
                                required: false,
                                helpText: "Only remove items with a score lower than this value. Ignored if 'Check Score?' is off.",
                            },
                        ],
                    },
                    {
                        type: "group",
                        label: "Age",
                        helpText: "If enabled, only items older than the specified age (in hours) will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "checkAge",
                                label: "Check Age?",
                            },
                            {
                                type: "number",
                                name: "minAge",
                                label: "Minimum Age",
                                required: false,
                                helpText: "Only nuke items older than this value (in hours). Ignored if 'Check Age?' is off.",
                            },
                        ],
                    },
                    {
                        type: "group",
                        label: "Reports",
                        helpText: "If enabled, only items with a number of reports higher than the specified value will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "checkReports",
                                label: "Check Reports?",
                            },
                            {
                                type: "number",
                                name: "minReports",
                                label: "Minimum Reports",
                                required: false,
                                helpText: "Only remove items with a number of reports higher than this value. Ignored if 'Check Reports?' is off.",
                            },
                        ],
                    },
                    {
                        type: "group",
                        label: "Title and Body Keyword/Phrase Filter",
                        helpText: "If specified, only items with the specified keywords/phrases in the item's title or body will be removed.",
                        fields: [
                            {
                                type: "boolean",
                                name: "useRegex",
                                label: "Use Regex?",
                            },
                            {
                                type: "paragraph",
                                name: "keywords",
                                label: "Keywords and/or Phrases",
                                required: false,
                                helpText: "If enabled, only items with the specified keywords and/or phrases in the title or body will be removed. Case-insensitive, one keyword/phrase per line.",
                            },
                        ],
                    },
                    {
                        type: "group",
                        label: "Report Reason Keyword/Phrase Filter",
                        helpText: "If specified, only items with the specified keywords/phrases in the report reason.",
                        fields: [
                            {
                                type: "boolean",
                                name: "reportUseRegex",
                                label: "Use Regex?",
                            },
                            {
                                type: "boolean",
                                name: "ignoreUserReports",
                                label: "Ignore User Reports?",
                                helpText: "If enabled, only consider moderator reports.",
                            },
                            {
                                type: "paragraph",
                                name: "reportKeywords",
                                label: "Report Keywords and/or Phrases",
                                required: false,
                                helpText: "If enabled, only report reasons with the specified keywords and/or phrases will be removed. Case-insensitive, one keyword/phrase per line.",
                            },
                        ],
                    },
                    {
                        type: "boolean",
                        name: "ignoreSticky",
                        label: "Ignore Sticky Posts",
                        helpText: "If enabled, sticky posts will be ignored.",
                    },
                    {
                        type: "boolean",
                        name: "ignoreModerator",
                        label: "Ignore Moderator Items",
                        helpText: "If enabled, items that have been posted by a moderator or distinguished will be ignored.",
                    },
                    {
                        type: "boolean",
                        name: "ignoreVisible",
                        label: "Ignore Visible Items",
                        helpText: "If enabled, items that are still visible are ignored. (i.e., not filtered by u/AutoModerator or removed by Reddit's spam filters)",
                    },
                    {
                        type: "boolean",
                        name: "ignorePreviouslyApproved",
                        label: "Ignore Previously Approved Items",
                        helpText: "If enabled, items that have been previously approved by a moderator will be ignored.",
                    },
                ],
            },
            {
                type: "boolean",
                name: "reapprovePreviouslyApproved",
                label: "Re-Approve Previously Approved Items",
                helpText: "Implies 'Ignore Previously Approved Items'. If enabled, items that have been previously approved by a moderator will be ignored.",
            },
            {
                type: "boolean",
                name: "ignoreReportsPreviouslyApproved",
                label: "Ignore Reports",
                helpText: "Implies 'Ignore Previously Approved Items'. If enabled, set 'Ignore Reports' on previously approved items.",
            },
            {
                type: "number",
                name: "scanLimit",
                label: "Modqueue Scan Limit",
                helpText: "The maximum number of items to scan in the modqueue. Default is 0. Set to 0 to scan all items.",
            },
        ],
        title: "Nuke Control Panel",
    },
    scanModqueue,
)

async function actionItems(context: ContextAPIClients & BaseContext, actionItem: ActionItem): Promise<ActionResult> {
    const {items, action, actionName} = actionItem;
    let postCount = 0;
    let commentCount = 0;
    let failedCount = 0;
    for (const item of items) {
        try {
            await action(item)
            if (item instanceof Comment) {
                commentCount++;
            } else {
                postCount++;
            }
        } catch (e) {
            if (actionName === "ignoring reports on") {
                console.log(`Action does not exist for item of type ${item.constructor.name}`)
            } else {
                log(context, `Error while ${actionName} ${item.permalink} by u/${item.authorName}`)
                console.error(`${e}`)
                failedCount++;
            }
        }
    }
    return {postCount, commentCount, failedCount};
}

async function check({
    checkFunc,
    failureMessage,
    target,
}: CheckParams): Promise<boolean> {
    const itemType = target.constructor.name.replace("_", "").toLowerCase()
    const baseString = `Skipping ${itemType} id: ${target.id.split("_")[1]} by u/${target.authorName} because`;
    const shouldRemove = await checkFunc(target);
    if (!shouldRemove) {
        console.log(`${baseString} ${failureMessage(target)}`)
    }
    return shouldRemove
}

async function nukeItems(_event: FormOnSubmitEvent, context: Context) {
    const {
        redis,
        reddit,
        subredditId,
        userId,
        ui,
    } = context
    const itemsToRemoveStore: string = await redis.get(`${userId}_${subredditId}_itemsToRemove`) || ""
    const itemsToApproveStore: string = await redis.get(`${userId}_${subredditId}_itemsToApprove`) || ""
    const itemsToIgnoreReportsStore: string = await redis.get(`${userId}_${subredditId}_itemsToIgnoreReports`) || ""
    const itemIdsToRemove: string[] = itemsToRemoveStore.split(",").filter((id) => id !== "")
    const itemIdsToApprove: string[] = itemsToApproveStore.split(",").filter((id) => id !== "")
    const itemIdsToIgnoreReports: string[] = itemsToIgnoreReportsStore.split(",").filter((id) => id !== "")
    console.log(`itemIdsToRemove: ${itemIdsToRemove}`)
    console.log(`itemIdsToApprove: ${itemIdsToApprove}`)
    console.log(`itemIdsToIgnoreReports: ${itemIdsToIgnoreReports}`)
    const itemsToApprove: ModqueueItem[] = await resolveItems(itemIdsToApprove, reddit);
    const itemsToIgnoreReports: ModqueueItem[] = await resolveItems(itemIdsToIgnoreReports, reddit);
    const itemsToRemove = await resolveItems(itemIdsToRemove, reddit);
    log(context, `Nuking ${itemsToRemove.length + itemsToApprove.length + itemsToIgnoreReports.length} items...`)
    let {
        postCount: removedPostCount,
        commentCount: removedCommentCount,
        failedCount: failedRemoveItemCount,
    } = await actionItems(context, {
            items: itemsToRemove, action: async (item: Post | Comment) => {
                await item.remove(false)
            }, actionName: "removing",
        },
    );
    let {
        postCount: approvedPostCount,
        commentCount: approvedCommentCount,
        failedCount: failedApproveItemCount,
    } = await actionItems(context, {
            items: itemsToApprove, action: async (item: Post | Comment) => {
                await item.approve()
            }, actionName: "re-approving",
        },
    );
    let {
        postCount: ignoredReportsPostCount,
        commentCount: ignoredReportsCommentCount,
        failedCount: failedIgnoreReportsItemCount,
    } = await actionItems(context, {
            action: async (item: Post | Comment) => {
                // @ts-ignore until support is added for comments
                return await item.ignoreReports()
            }, actionName: "ignoring reports on", items: itemsToApprove,
        },
    );
    logActionSuccess(
        context,
        {postCount: removedPostCount, commentCount: removedCommentCount, actionName: "removed"},
        {postCount: approvedPostCount, commentCount: approvedCommentCount, actionName: "re-approved"},
        {
            postCount: ignoredReportsPostCount,
            commentCount: ignoredReportsCommentCount,
            actionName: "ignored reports on",
        },
    );
    let errorMessage = "Failed to ";
    let messages: string[] = []
    if (failedRemoveItemCount > 0) {
        messages.push(`remove ${failedRemoveItemCount} items`)
    }
    if (failedApproveItemCount > 0) {
        messages.push(`re-approve ${failedApproveItemCount} items`)
    }
    if (failedIgnoreReportsItemCount > 0) {
        messages.push(`ignore reports on ${failedIgnoreReportsItemCount} items`)
    }
    if (failedRemoveItemCount + failedApproveItemCount + failedIgnoreReportsItemCount > 0) {
        let lastMessage = messages.pop();
        errorMessage += messages.join(", ") + (
            messages.length > 1 ? ', and ' : ' and '
        ) + lastMessage;
        console.error(errorMessage);
        ui.showToast({
            text: errorMessage,
            appearance: "neutral",
        })
    }
}

async function resolveItems(itemIds: string[], reddit: RedditAPIClient): Promise<ModqueueItem[]> {
    const items: ModqueueItem[] = []
    if (itemIds.length !== 0) {
        for (const id of itemIds) {
            if (id.startsWith("t1_")) {
                items.push(await reddit.getCommentById(id));
            } else {
                items.push(await reddit.getPostById(id));
            }
        }
    }
    return items;
}

async function scanModqueue(event: FormOnSubmitEvent, context: Context) {
    const {
        reddit,
        redis,
        userId,
        ui
    } = context;
    const subreddit: Subreddit = await reddit.getCurrentSubreddit()
    // Check invoker has the necessary mod permissions
    const moderator: User = await reddit.getUserById(userId ? userId : "")
    const permissions = await moderator.getModPermissionsForSubreddit(subreddit.name)
    if (!(
        permissions.includes("all") || permissions.includes("posts")
    )) {
        ui.showToast({
            text: "You do not have the necessary permissions to nuke the modqueue! You must have at least 'posts' permissions.",
            appearance: "neutral",
        })
        return;
    }
    const {
        itemType,
        checkScore,
        maxScore,
        checkAge,
        minAge,
        checkReports,
        minReports,
        useRegex,
        keywords,
        reportUseRegex,
        ignoreUserReports,
        reportKeywords,
        ignoreSticky,
        ignoreModerator,
        ignoreVisible,
        ignorePreviouslyApproved,
        reapprovePreviouslyApproved,
        ignoreReportsPreviouslyApproved,
        scanLimit
    } = event.values;
    if (itemType == undefined) {
        ui.showToast({
            text: "You must select a type of item to nuke",
            appearance: "neutral",
        })
        return;
    }
    let itemsToRemove: ModqueueItem[] = [];
    let itemsToApprove: ModqueueItem[] = [];
    let itemsToIgnoreReports: ModqueueItem[] = [];
    let removeCommentCount = 0;
    let removePostCount = 0;
    let approveCommentCount = 0;
    let approvePostCount = 0;
    let ignoreReportsCommentCount = 0;
    let ignoreReportsPostCount = 0;
    let modqueueCount = 0;
    const moderators: string[] = (await subreddit.getModerators().all()).map((moderator) => moderator.username);
    try {
        let modQueue = subreddit.getModQueue({type: itemType[0]});
        let items: Promise<ModqueueItem[]> = scanLimit > 0 ? modQueue.get(scanLimit) : modQueue.all();
        await items.then(async (items: ModqueueItem[]) => {
            for (const item of items) {
                modqueueCount++;
                if (checkScore && !(
                    await check({
                        checkFunc: async (target) => target.score <= maxScore,
                        failureMessage: (target) => `the score is too high ${generateItemCounts({
                            name: "Score",
                            count: target.score,
                        })}`,
                        target: item,
                    })
                )) continue;
                if (checkAge && !(
                    await check({
                        checkFunc: async (target) => target.createdAt.getMilliseconds() <= (
                            Date.now() - (
                                minAge * 60 * 60 * 1000
                            )
                        ),
                        failureMessage: (target) => `the ${itemType} isn't old enough ${generateItemCounts({
                            name: "Age",
                            value: formatAge(target),
                        })}`,
                        target: item,
                    })
                )) continue;
                if (checkReports) {
                    let reportCount = item instanceof Comment ? item.numReports : item.numberOfReports;
                    if (!(await check({
                        checkFunc: async (_target) => reportCount >= minReports,
                        failureMessage: (_target) => `report count is too low ${generateItemCounts({
                            name: "Reports",
                            count: reportCount
                        })}`,
                        target: item
                    }))) continue;
                }
                if (ignoreSticky && !(
                    await check({
                        checkFunc: async (target) => !target.isStickied(),
                        failureMessage: (_target) => "it is stickied",
                        target: item,
                    })
                )) continue;
                if ((ignorePreviouslyApproved || reapprovePreviouslyApproved || ignoreReportsPreviouslyApproved) && !(
                    await check({
                        checkFunc: async (target) => !target.isApproved(),
                        failureMessage: (_target) => "it was previously approved",
                        target: item,
                    })
                )) {
                    if (reapprovePreviouslyApproved) {
                        itemsToApprove.push(item)
                        item instanceof Post ? approvePostCount++ : approveCommentCount;
                    }
                    if (ignoreReportsPreviouslyApproved) {
                        if (item instanceof Comment) {
                            itemsToIgnoreReports.push(item)
                        }
                        item instanceof Post ? ignoreReportsPostCount++ : ignoreReportsCommentCount;
                    }
                    continue;
                }
                if (keywords != undefined && keywords != "" && !(
                    await check({
                        checkFunc: async (target) => {
                            let body: string = target.body ? target.body : "";
                            if (target instanceof Post) {
                                body = target.title + "\n" + body
                            }
                            return evaluateKeywordMatch(useRegex, keywords, body);
                        },
                        failureMessage: (_target) => "the title/body doesn't contain the specified keywords",
                        target: item,
                    })
                )) continue;
                if (reportKeywords != undefined && reportKeywords != "" && !(
                    await check({
                        checkFunc: async (target) => {
                            let reports: string[] = []
                            if (!ignoreUserReports && target.userReportReasons != undefined) {
                                reports.push(...target.userReportReasons)
                            }
                            if (target.modReportReasons != undefined) {
                                reports.push(...target.modReportReasons)
                            }
                            return evaluateKeywordMatch(reportUseRegex, reportKeywords, reports.join("\n"))
                        },
                        failureMessage: (_target) => "its reports doesn't contain the specified keywords",
                        target: item,
                    })
                )) continue;
                if (ignoreModerator && !(
                    await check({
                        checkFunc: async (target) => !(
                            moderators.includes(target.authorName) || target.distinguishedBy !== undefined
                        ),
                        failureMessage: (_target) => "the author is is a moderator or it is distinguished",
                        target: item,
                    })
                ) || ignoreVisible && !(
                    await check({
                        checkFunc: async (target) => {
                            return target.spam
                                || target.removed
                                // @ts-ignore
                                || target.removedByCategory
                                === "automod_filtered"
                                // @ts-ignore
                                || target.bannedBy
                                === "AutoModerator"
                                // @ts-ignore
                                || target.bannedBy?.toString()
                                === "true"
                                // @ts-ignore
                                || target.removalReason
                                === "legal"
                                && !target.approved
                        },
                        failureMessage: (_target) => "it is visible",
                        target: item,
                    })
                )) continue;
                item instanceof Post ? removePostCount++ : removeCommentCount++;
                itemsToRemove.push(item)
            }
        })
        log(context, `Checked ${modqueueCount} items in the modqueue`)
        if (itemsToRemove.length + itemsToApprove.length + itemsToIgnoreReports.length == 0) {
            log(context, "No items found to nuke")
            return;
        }
        await redis.set(
            `${context.userId}_${context.subredditId}_itemsToRemove`,
            itemsToRemove.map((item) => item.id).join(","),
        )
        await redis.set(
            `${context.userId}_${context.subredditId}_itemsToApprove`,
            itemsToApprove.map((item) => item.id).join(","),
        )
        await redis.set(
            `${context.userId}_${context.subredditId}_itemsToIgnoreReports`,
            itemsToIgnoreReports.map((item) => item.id).join(","),
        )
        let description = "Found ";
        let toNuke: string[] = []
        if (itemsToRemove.length > 0) {
            toNuke.push(`${itemsToRemove.length} items to remove ${generateItemCounts(
                {
                    name: "Posts",
                    count: removePostCount,
                },
                {
                    name: "Comments",
                    count: removeCommentCount,
                },
            )}`)
        }
        if (itemsToApprove.length > 0) {
            toNuke.push(`${itemsToApprove.length} items to re-approve ${generateItemCounts(
                {
                    name: "Posts",
                    count: approvePostCount,
                },
                {
                    name: "Comments",
                    count: approveCommentCount,
                },
            )}`)
        }
        if (itemsToIgnoreReports.length > 0) {
            toNuke.push(`${itemsToIgnoreReports.length} items to ignore reports on ${generateItemCounts(
                {
                    name: "Posts",
                    count: ignoreReportsPostCount,
                },
                {
                    name: "Comments",
                    count: ignoreReportsCommentCount,
                },
            )}`)
        }
        let lastItem = toNuke.pop();
        description += toNuke.length ? toNuke.join(", ") + (
            toNuke.length > 1 ? ", and " : " and "
        ) : "";
        description += lastItem;
        description += ". Are you sure you want to nuke these items?"
        ui.showForm(nukeForm, {
                description: description,
            },
        )
    } catch (e) {
        ui.showToast({
            text: "An error occurred scanning the modqueue",
            appearance: "neutral",
        })
        console.error(`${e}`, e)
    }
}

function evaluateKeywordMatch(useRegex: boolean, keywords: string, body: string) {
    if (useRegex) {
        let regex: RegExp = new RegExp(keywords, "i");
        return regex.test(body);
    } else {
        let keywordsArray: string[] = keywords.split("\n");
        return keywordsArray.some((keyword: string) => body.toLowerCase().includes(keyword.toLowerCase()))
    }
}

function formatAge({createdAt}: ModqueueItem): string {
    const ageInSeconds = (
        // @ts-ignore
        new Date() - createdAt
    ) / 1000
    const seconds = ageInSeconds % 60;
    const minutes = Math.floor(ageInSeconds / 60) % 60;
    const hours = Math.floor(ageInSeconds / 3600) % 24;
    const days = Math.floor(ageInSeconds / 86400);

    let ageString = "";
    if (days > 0) {
        ageString += `${days} day${days === 1 ? "" : "s"} `;
    }
    if (hours > 0 && days < 2) {
        if (ageString != "") {
            ageString += ", ";
        }
        ageString += `${hours} hour${hours === 1 ? "" : "s"} `;
    }
    if (minutes > 0 && days === 0 && hours === 0) {
        if (ageString != "") {
            ageString += ", ";
        }
        ageString += `${minutes} minute${minutes === 1 ? "" : "s"} `;
    }
    if (seconds > 0 && days === 0 && hours === 0 && minutes === 0) {
        if (ageString != "") {
            ageString += ", ";
        }
        ageString += `${seconds} second${seconds === 1 ? "" : "s"} `;
    }
    ageString += "ago";
    return ageString.trim();
}

function generateItemCounts(...items: GenerateItemCountsParams[]): string {
    let itemsCounts = "";
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
        itemsCounts = `(${elements.join(", ")})`
    }
    return itemsCounts;
}

function log(context: Context, message: string): void {
    console.log(message)
    context.ui.showToast(message)
}

function logActionSuccess(context: ContextAPIClients & BaseContext, ...actions: LogAction[]): void {
    for (const {postCount, commentCount, actionName} of actions) {
        const totalCount: number = postCount + commentCount;
        if (totalCount != 0) {
            const itemsText = totalCount === 1 ? "item" : "items";
            log(
                context,
                `Successfully ${actionName} ${totalCount} ${itemsText} ${generateItemCounts({
                    name: "Post" + (
                        postCount === 1 ? "" : "s"
                    ),
                    count: postCount,
                }, {
                    name: "Comment" + (
                        commentCount === 1 ? "" : "s"
                    ),
                    count: commentCount,
                })}`,
            );
        }
    }
}

// noinspection JSUnusedGlobalSymbols
export default Devvit;
