import {
    BaseContext,
    Comment,
    Context,
    ContextAPIClients,
    Devvit,
    Form,
    FormOnSubmitEvent,
    JSONObject,
    MenuItemOnPressEvent,
    Post,
    RedditAPIClient,
    SettingScope,
    Subreddit,
    TriggerContext,
    User,
} from "@devvit/public-api";

type ModqueueItem = Comment | Post;

interface ActionItem {
    action: (item: (Post | Comment)) => Promise<void>;
    actionName: string;
    items: ModqueueItem[];
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
    count?: number;
    name: string;
    value?: string;
}

interface LogAction {
    actionName: string;
    commentCount: number;
    postCount: number;
}

Devvit.configure({
    redditAPI: true,
    redis: true,
});


Devvit.addSettings([
    {
        type: "group",
        label: "General Settings",
        fields: [
            {
                defaultValue: 3,
                label: "Retry Limit",
                name: "retryLimit",
                scope: SettingScope.App,
                type: "number",
            },        
        ],
    },
    {
        type: "group",
        label: "Mod action settings",
        fields: [
            {
                defaultValue: false,
                label: "Nuke queued items on post removal",
                helpText: "If a post is removed, all comments on that post that are in the modqueue will be removed as well.",
                name: "nukeOnPostRemove",
                scope: SettingScope.App,
                type: "boolean",
            },
            {
                defaultValue: false,
                label: "Nuke queued items on post lock",
                helpText: "If a post is locked, all comments on that post that are in the modqueue will be removed as well.",
                name: "nukeOnPostLock",
                scope: SettingScope.App,
                type: "boolean",
            },
        ],
    },
]);

const nukeForm = Devvit.createForm(
    (data: JSONObject) => (
        {
            fields: [],
            title: "Confirm Nuke",
            acceptLabel: "Nuke!",
            description: data.description,
        }
    ) as Form,
    nukeItems,
);


Devvit.addMenuItem(
    {
        description: "Nuke items in the modqueue",
        forUserType: "moderator",
        label: "Nuke Modqueue",
        location: ["subreddit"],
        onPress: (_event: MenuItemOnPressEvent, context) => {
            context.ui.showForm(controlPanel);
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
                label: "Ignore Reports on Previously Approved Items",
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
);

async function actionItems(context: ContextAPIClients & BaseContext, actionItem: ActionItem): Promise<ActionResult> {
    const {items, action, actionName} = actionItem;
    let postCount = 0;
    let commentCount = 0;
    let failedCount = 0;
    await Promise.all(items.map(async (item) => {
        const retryLimit: number = await context.settings.get("retryLimit") || 3;
        let retryCount = 0;
        while (retryCount < retryLimit) {
            try {
                await action(item);
                if (item instanceof Comment) {
                    commentCount++;
                } else {
                    postCount++;
                }
                break;
            } catch (e) {
                if (retryCount === retryLimit - 1) {
                    if (actionName === "ignoring reports on") {
                        console.log(`Action does not exist for item of type ${item.constructor.name}`);
                    } else {
                        log(context, `Error while ${actionName} ${item.permalink} by u/${item.authorName}`);
                        console.error(e);
                        failedCount++;
                    }
                }
                console.log(`Retrying ${actionName} ${item.permalink} by u/${item.authorName} ${retryCount}/${retryLimit}`);
                retryCount++;
            }
        }
    }));
    return {postCount, commentCount, failedCount};
}

async function check({
    checkFunc,
    failureMessage,
    target,
}: CheckParams): Promise<boolean> {
    const itemType = target.constructor.name.replace("_", "").toLowerCase();
    const baseString = `Skipping ${itemType} id: ${target.id.split("_")[1]} by u/${target.authorName} because`;
    const shouldRemove = await checkFunc(target);
    if (!shouldRemove) {
        console.log(`${baseString} ${failureMessage(target)}`);
    }
    return shouldRemove;
}

async function nukeItems(_event: FormOnSubmitEvent<JSONObject>, context: Context) {
    const {
        redis,
        reddit,
        userId,
        ui,
    } = context;
    const itemsToRemoveStore: string = await redis.get(`${userId}_itemsToRemove`) || "";
    const itemsToApproveStore: string = await redis.get(`${userId}_itemsToApprove`) || "";
    const itemsToIgnoreReportsStore: string = await redis.get(`${userId}_itemsToIgnoreReports`) || "";
    const itemIdsToRemove: string[] = itemsToRemoveStore.split(",").filter((id) => id !== "");
    const itemIdsToApprove: string[] = itemsToApproveStore.split(",").filter((id) => id !== "");
    const itemIdsToIgnoreReports: string[] = itemsToIgnoreReportsStore.split(",").filter((id) => id !== "");
    console.log(`itemIdsToRemove: ${itemIdsToRemove}`);
    console.log(`itemIdsToApprove: ${itemIdsToApprove}`);
    console.log(`itemIdsToIgnoreReports: ${itemIdsToIgnoreReports}`);
    const resolvedItems: Map<string, ModqueueItem> = new Map();
    await resolveItems((
        itemIdsToApprove
    ).concat(itemIdsToIgnoreReports).concat(itemIdsToRemove), reddit).then((items) => {
        items.forEach((item) => {
            resolvedItems.set(item.id, item);
        });
    });

    const itemsToApprove: ModqueueItem[] = itemIdsToApprove.map((id) => resolvedItems.get(id))
        .filter((item) => item !== undefined) as ModqueueItem[];
    const itemsToIgnoreReports: ModqueueItem[] = itemIdsToIgnoreReports.map((id) => resolvedItems.get(id))
        .filter((item) => item !== undefined) as ModqueueItem[];
    const itemsToRemove = await resolveItems(itemIdsToRemove, reddit);
    log(context, `Nuking ${itemsToRemove.length + itemsToApprove.length + itemsToIgnoreReports.length} items...`);
    const [removeResults, approveResults, ignoreReportsResults] = await Promise.all([
        actionItems(context, {
            action: async (item: Post | Comment) => {
                await item.remove(false);
            },
            actionName: "removing",
            items: itemsToRemove,
        }),
        actionItems(context, {
            action: async (item: Post | Comment) => {
                await item.approve();
            },
            actionName: "re-approving",
            items: itemsToApprove,
        }),
        actionItems(context, {
            action: async (item: Post | Comment) => {
                // @ts-ignore until support is added for comments
                return await item.ignoreReports();
            },
            actionName: "ignoring reports on",
            items: itemsToIgnoreReports,
        }),
    ]);

    let {
        postCount: removedPostCount,
        commentCount: removedCommentCount,
        failedCount: failedRemoveItemCount,
    } = removeResults;
    let {
        postCount: approvedPostCount,
        commentCount: approvedCommentCount,
        failedCount: failedApproveItemCount,
    } = approveResults;
    let {
        postCount: ignoredReportsPostCount,
        commentCount: ignoredReportsCommentCount,
        failedCount: failedIgnoreReportsItemCount,
    } = ignoreReportsResults;

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
    let messages: string[] = [];
    if (failedRemoveItemCount > 0) {
        messages.push(`remove ${failedRemoveItemCount} items`);
    }
    if (failedApproveItemCount > 0) {
        messages.push(`re-approve ${failedApproveItemCount} items`);
    }
    if (failedIgnoreReportsItemCount > 0) {
        messages.push(`ignore reports on ${failedIgnoreReportsItemCount} items`);
    }
    if (failedRemoveItemCount + failedApproveItemCount + failedIgnoreReportsItemCount > 0) {
        errorMessage += humanList(messages);
        console.error(errorMessage);
        ui.showToast({
            text: errorMessage,
            appearance: "neutral",
        });
    }
}

async function resolveItems(itemIds: string[], reddit: RedditAPIClient): Promise<ModqueueItem[]> {
    let items: ModqueueItem[] = [];
    if (itemIds.length !== 0) {
        const fetchItems = itemIds.map(async (id) => {
            if (id.startsWith("t1_")) {
                return reddit.getCommentById(id);
            } else {
                return reddit.getPostById(id);
            }
        });
        items = await Promise.all(fetchItems);
    }
    return items;
}

async function scanModqueue(event: FormOnSubmitEvent<JSONObject>, context: Context) {
    const {
        reddit,
        redis,
        userId,
        ui,
    } = context;
    const subreddit: Subreddit = await reddit.getCurrentSubreddit();
    // @ts-ignore
    const moderator: User = await reddit.getUserById(userId || "");
    const permissions = await moderator.getModPermissionsForSubreddit(subreddit.name);
    if (!(
        permissions.includes("all") || permissions.includes("posts")
    )) {
        ui.showToast({
            text: "You do not have the necessary permissions to nuke the modqueue! You must have at least 'posts' permissions.",
            appearance: "neutral",
        });
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
    } = event.values;
    if (itemType == undefined) {
        ui.showToast({
            text: "You must select a type of item to nuke",
            appearance: "neutral",
        });
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
    const moderators: string[] = (
        await subreddit.getModerators().all()
    ).map((moderator) => moderator.username);
    try {
        const listings: Promise<ModqueueItem[]>[] = [];
        let commentModqueue = subreddit.getModQueue({type: "comment"});
        let commentItems: Promise<ModqueueItem[]> = commentModqueue.all();
        let postModqueue = subreddit.getModQueue({type: "post"});
        let postItems: Promise<ModqueueItem[]> = postModqueue.all();
        switch ((
            itemType as string[]
        )[0]) {
            case "all":
                listings.push(commentItems);
                listings.push(postItems);
                break;
            case "comment":
                listings.push(commentItems);
                break;
            case "post":
                listings.push(postItems);
                break;
        }
        let items: Promise<FlatArray<Awaited<ModqueueItem>[], 1>[]> = Promise.all(listings)
            .then((items) => items.flat());
        await items.then(async (items: ModqueueItem[]) => {
            for (const item of items) {
                modqueueCount++;
                const previouslyApprovedCheck = (
                    ignorePreviouslyApproved || reapprovePreviouslyApproved || ignoreReportsPreviouslyApproved
                ) && !(
                    await check({
                        checkFunc: async (target) => !target.isApproved(),
                        failureMessage: (_target) => "it was previously approved",
                        target: item,
                    })
                );
                if (previouslyApprovedCheck) {
                    if (reapprovePreviouslyApproved) {
                        itemsToApprove.push(item);
                        item instanceof Post ? approvePostCount++ : approveCommentCount++;
                    }
                    if (ignoreReportsPreviouslyApproved) {
                        if (!(
                            item instanceof Comment
                        )) {
                            itemsToIgnoreReports.push(item);
                        }
                        item instanceof Post ? ignoreReportsPostCount++ : ignoreReportsCommentCount++;
                    }
                    continue;  // Skip further processing as in the original continue statement
                }

                const checkResults = await Promise.all([
                    checkScore ? check({
                        checkFunc: async (target) => target.score <= (
                            maxScore as number
                        ),
                        failureMessage: (target) => `the score is too high ${generateItemCounts({
                            name: "Score",
                            count: target.score,
                        })}`,
                        target: item,
                    }) : true,
                    checkAge ? check({
                        checkFunc: async (target) => target.createdAt.getMilliseconds() <= (
                            Date.now() - (
                                (
                                    minAge as number
                                ) * 60 * 60 * 1000
                            )
                        ),
                        failureMessage: (target) => `the ${itemType} isn't old enough ${generateItemCounts({
                            name: "Age",
                            value: formatAge(target),
                        })}`,
                        target: item,
                    }) : true,
                    checkReports ? check({
                        checkFunc: async (_target) => {
                            let reportCount = item instanceof Comment ? item.numReports : item.numberOfReports;
                            return reportCount >= (
                                minReports as number
                            );
                        },
                        failureMessage: (_target) => `report count is too low ${generateItemCounts({
                            name: "Reports",
                            count: item instanceof Comment ? item.numReports : item.numberOfReports,
                        })}`,
                        target: item,
                    }) : true,
                    ignoreSticky ? check({
                        checkFunc: async (target) => !target.isStickied(),
                        failureMessage: (_target) => "it is stickied",
                        target: item,
                    }) : true,
                    keywords ? check({
                        checkFunc: async (target) => {
                            let body: string = target.body ? target.body : "";
                            if (target instanceof Post) {
                                body = target.title + "\n" + body;
                            }
                            return evaluateKeywordMatch(useRegex as boolean, keywords as string, body);
                        },
                        failureMessage: (_target) => "the title/body doesn't contain the specified keywords",
                        target: item,
                    }) : true,
                    reportKeywords ? check({
                        checkFunc: async (target) => {
                            let reports: string[] = [];
                            if (!ignoreUserReports && target.userReportReasons != undefined) {
                                reports.push(...target.userReportReasons);
                            }
                            if (target.modReportReasons != undefined) {
                                reports.push(...target.modReportReasons);
                            }
                            return evaluateKeywordMatch(
                                reportUseRegex as boolean,
                                reportKeywords as string,
                                reports.join("\n"),
                            );
                        },
                        failureMessage: (_target) => "its reports doesn't contain the specified keywords",
                        target: item,
                    }) : true,
                    ignoreModerator || ignoreVisible ? check({
                        checkFunc: async (target) => {
                            const authorIsModerator = moderators.includes(target.authorName)
                                || target.distinguishedBy
                                !== undefined;
                            const isVisible = !(
                                target.spam || target.removed ||
                                // @ts-ignore
                                target.removedByCategory === "automod_filtered" ||
                                // @ts-ignore
                                target.bannedBy === "AutoModerator" ||
                                // @ts-ignore
                                target.bannedBy?.toString() === "true" ||
                                // @ts-ignore
                                target.removalReason === "legal" && !target.approved
                            );
                            return !(
                                ignoreModerator && authorIsModerator
                            ) && !(
                                ignoreVisible && isVisible
                            );
                        },
                        failureMessage: (_target) => ignoreModerator
                            ? "the author is a moderator or distinguished"
                            : "it is visible",
                        target: item,
                    }) : true,
                ]);

                if (checkResults.some(result => !result)) {
                    continue;  // Skip further processing if any check fails
                }

                item instanceof Post ? removePostCount++ : removeCommentCount++;
                itemsToRemove.push(item);
            }
        });
        log(context, `Checked ${modqueueCount} items in the modqueue`);
        if (itemsToRemove.length + itemsToApprove.length + itemsToIgnoreReports.length == 0) {
            log(context, "No items found to nuke");
            return;
        }

        await redis.set(
            `${context.userId}_itemsToRemove`,
            itemsToRemove.map((item) => item.id).join(","),
        );
        await redis.set(
            `${context.userId}_itemsToApprove`,
            itemsToApprove.map((item) => item.id).join(","),
        );
        await redis.set(
            `${context.userId}_itemsToIgnoreReports`,
            itemsToIgnoreReports.map((item) => item.id).join(","),
        );

        let description = "Found ";
        let toNuke: string[] = [];

        if (itemsToRemove.length > 0) {
            toNuke.push(addToNuke(itemsToRemove, "remove", removePostCount, removeCommentCount));
        }
        if (itemsToApprove.length > 0) {
            toNuke.push(addToNuke(itemsToApprove, "re-approve", approvePostCount, approveCommentCount));
        }
        if (itemsToIgnoreReports.length > 0) {
            toNuke.push(addToNuke(
                itemsToIgnoreReports,
                "ignore reports on",
                ignoreReportsPostCount,
                ignoreReportsCommentCount,
            ));
        }

        let lastItem = toNuke.pop();
        description += toNuke.length ? toNuke.join(", ") + (
            toNuke.length > 1 ? ", and " : " and "
        ) : "";
        description += lastItem;
        description += ". Are you sure you want to nuke these items?";

        ui.showForm(nukeForm, {
            description: description,
        });
    } catch (e) {
        ui.showToast({
            text: "An error occurred scanning the modqueue",
            appearance: "neutral",
        });
        console.error(`${e}`, e);
    }
}

function evaluateKeywordMatch(useRegex: boolean, keywords: string, body: string) {
    if (useRegex) {
        let regex: RegExp = new RegExp(keywords, "i");
        return regex.test(body);
    } else {
        let keywordsArray: string[] = keywords.split("\n");
        return keywordsArray.some((keyword: string) => body.toLowerCase().includes(keyword.toLowerCase()));
    }
}

function formatAge({createdAt}: ModqueueItem): string {
    const ageInSeconds = (
        // @ts-ignore
        new Date() - createdAt
    ) / 1000;
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

function humanList(items: string[]): string {
    if (items.length === 0) {
        return "";
    }
    if (items.length === 1) {
        return items[0];
    }
    let workingItems = items.slice();
    const last = workingItems.pop();
    return workingItems.filter((value) => value.length > 0).join(", ") + (
        workingItems.length > 1 ? ", and " : " and "
    ) + last;
}

function generateItemCounts(...items: GenerateItemCountsParams[]): string {
    let itemsCounts = "";
    let elements: string[] = [];
    items.forEach((item) => {
        if (item.count != undefined) {
            if (item.count > 0) {
                elements.push(`${item.name}: ${item.count}`);
            }
        } else if (item.value != undefined) {
            if (item.value != "") {
                elements.push(`${item.name}: ${item.value}`);
            }
        }
    });
    if (elements.length > 0) {
        itemsCounts = `(${elements.join(", ")})`;
    }
    return itemsCounts;
}

function log(context: Context, message: string): void {
    console.log(message);
    context.ui.showToast(message);
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

function addToNuke(
    items: ModqueueItem[],
    action: string,
    postCount: number,
    commentCount: number,
): string {
    return `${items.length} item${items.length > 1 ? "s" : ""} to ${action} ${generateItemCounts(
        {name: "Posts", count: postCount},
        {name: "Comments", count: commentCount},
    )}`;
}

Devvit.addTrigger({
    event: "ModAction",
    onEvent: async (event, context) => {
        if (event.action === "removelink" || event.action === "spamlink") {
            const target = event.targetPost?.id;
            if (!target) {
                console.log("No target post id found - not removing comments");
                return;
            }

            if (!context.settings.get<boolean>("nukeOnRemove")) {
                console.log("Nuke on remove is disabled - not removing comments");
                return;
            }

            await handleNukeOnRemoveOrLock(target, "remove", context);
        } else if (event.action === "lock") {
            if (event.targetComment?.id) {
                console.log("Lock action on comment - not removing comments");
                return;
            }
            const target = event.targetPost?.id;
            if (!target) {
                console.log("No target post id found - not removing comments");
                return;
            }

            if (!context.settings.get<boolean>("nukeOnLock")) {
                console.log("Nuke on lock is disabled - not removing comments");
                return;
            }

            await handleNukeOnRemoveOrLock(target, "lock", context);
        }
    },
});

Devvit.addSchedulerJob({
    name: "nukeModQueue",
    onRun: async (event, context) => {
        const redisKey = event.data?.redisKey as string | undefined;
        if (!redisKey) {
            console.log("No redis key found - not removing comments");
            return;
        }

        const currentAttempt = event.data?.attempt as number || 1;
        const commentsToRemove = await context.redis.zRange(redisKey, 0, -1);
        if (commentsToRemove.length === 0) {
            console.log(`No comments to remove in the nuke queue on run ${currentAttempt}`);
            await context.redis.del(redisKey);
            return;
        }

        const retryCount = await context.settings.get<number>("retryLimit") || 3;

        if (currentAttempt < retryCount) {
            // Schedule the next attempt for one minute in the future in case this one fails.
            await context.scheduler.runJob({
                name: "nukeModQueue",
                runAt: new Date(Date.now() + 60_000),
                data: { 
                    redisKey,
                    attempt: currentAttempt + 1 
                },
            });
        }

        const results = await Promise.all(commentsToRemove.map(async comment => {
            try {
                await context.reddit.remove(comment.member, false);
                await context.redis.zRem(redisKey, [comment.member]);
                return true;
            } catch (e) {
                console.error(`Failed to remove comment ${comment.member} - ${e}`);
                return false;
            }
        }));

        console.log(`Removed ${results.filter(result => result).length} comments from the modqueue`);

        if (results.every(result => result)) {
            console.log(`All comments removed from the modqueue - deleting redis key ${redisKey}`);
            await context.redis.del(redisKey);
        }
    }
})

async function handleNukeOnRemoveOrLock (target: string, type: "lock" | "remove", context: TriggerContext) {
    // A post may be locked and removed in quick succession (e.g. via Toolbox). Use Redis to ensure that we only do it once.
    const redisKey = `nukeLock:${target}`
    if (await context.redis.exists(redisKey)) {
        return;
    }
    await context.redis.set(redisKey, "true", { expiration: new Date(Date.now() + 10_000) });

    const subredditName = context.subredditName ?? await context.reddit.getCurrentSubredditName();

    if (type === "remove") {
        // A "removelink" action may also include an AutoMod/Reddit filter event. We don't want to nuke in those cases.
        const queuedPosts = await context.reddit.getModQueue({
            subreddit: subredditName,
            type: "post",
            limit: 1000,
        }).all();
    
        if (queuedPosts.some(item => item.id === target)) {
            // The post itself is in the queue i.e. has been filtered and not removed.
            await context.redis.del(redisKey);
            console.log(`Post ${target} is in the modqueue - not removing comments`);
            return;
        }    
    }

    const queuedComments = await context.reddit.getModQueue({
        subreddit: subredditName,
        type: "comment",
        limit: 1000,
    }).all();

    const queuedCommentsForThisPost = queuedComments.filter(item => item.postId === target);
    if (queuedCommentsForThisPost.length === 0) {
        // Nothing to do - there are no comments on this post in the modqueue.
        await context.redis.del(redisKey);
        console.log(`No comments in the modqueue for post ${target} - not removing comments`);
        return;
    }

    const queueRedisKey = `nukeQueue:${target}`;

    await context.redis.zAdd(queueRedisKey, ...queuedCommentsForThisPost.map(comment => ({ member: comment.id, score: 0 })));
    await context.scheduler.runJob({
        name: "nukeModQueue",
        runAt: new Date(Date.now() + 1000),
        data: { 
            redisKey: queueRedisKey,
            attempt: 1 
        },
    });

    console.log(`Queued ${queuedCommentsForThisPost.length} comments for removal from the modqueue for post ${target}`);
}

// noinspection JSUnusedGlobalSymbols
export default Devvit;
