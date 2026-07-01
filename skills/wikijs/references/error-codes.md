# Wiki.js GraphQL 错误码完整参考

来源：https://docs.requarks.io/dev/api（官方文档）

## 响应格式

所有 mutation 返回 `responseResult` 对象：

```graphql
type ResponseStatus {
  succeeded: Boolean!
  errorCode: Int!
  slug: String!
  message: String
}
```

成功示例：`{ succeeded: true, errorCode: 0, slug: "ok", message: "..." }`

## 1xxx — Authentication / Users

| Code | Slug | Message |
|------|------|---------|
| 1001 | AuthGenericError | An unexpected error occured during login. |
| 1002 | AuthLoginFailed | Invalid email / username or password. |
| 1003 | AuthProviderInvalid | Invalid authentication provider. |
| 1004 | AuthAccountAlreadyExists | An account already exists using this email address. |
| 1005 | AuthTFAFailed | Incorrect TFA Security Code. |
| 1006 | AuthTFAInvalid | Invalid TFA Security Code or Login Token. |
| 1007 | BruteInstanceIsInvalid | Invalid Brute Force Instance. |
| 1008 | BruteTooManyAttempts | Too many attempts! Try again later. |
| 1009 | UserCreationFailed | An unexpected error occured during user creation. |
| 1010 | AuthRegistrationDisabled | Registration is disabled. |
| 1011 | AuthRegistrationDomainUnauthorized | Your domain is not whitelisted. |
| 1012 | InputInvalid | Input data is invalid. |
| 1013 | AuthAccountBanned | Your account has been disabled. |
| 1014 | AuthAccountNotVerified | You must verify your account before login. |
| 1015 | AuthValidationTokenInvalid | Invalid validation token. |
| 1016 | UserNotFound | This user does not exist. |
| 1017 | UserDeleteForeignConstraint | Cannot delete user because of content relational constraints. |
| 1018 | UserDeleteProtected | Cannot delete a protected system account. |
| 1019 | AuthRequired | You must be authenticated to access this resource. |
| 1020 | AuthPasswordInvalid | Password is incorrect. |

## 2xxx — Assets

| Code | Slug | Message |
|------|------|---------|
| 2001 | AssetGenericError | An unexpected error occured during asset operation. |
| 2002 | AssetFolderExists | An asset folder with the same name already exists. |
| 2003 | AssetDeleteForbidden | You are not authorized to delete this asset. |
| 2004 | AssetInvalid | This asset does not exist or is invalid. |
| 2005 | AssetRenameCollision | An asset with the same filename already exists. |
| 2006 | AssetRenameForbidden | You are not authorized to rename this asset. |
| 2007 | AssetRenameInvalid | The new asset filename is invalid. |
| 2008 | AssetRenameInvalidExt | The file extension cannot be changed. |
| 2009 | AssetRenameTargetForbidden | You are not authorized to rename to the requested name. |

## 3xxx — Mail

| Code | Slug | Message |
|------|------|---------|
| 3001 | MailGenericError | An unexpected error occured during mail operation. |
| 3002 | MailNotConfigured | The mail configuration is incomplete or invalid. |
| 3003 | MailTemplateFailed | Mail template failed to load. |
| 3004 | MailInvalidRecipient | The recipient email address is invalid. |

## 4xxx — Search

| Code | Slug | Message |
|------|------|---------|
| 4001 | SearchGenericError | An unexpected error occured during search operation. |
| 4002 | SearchActivationFailed | Search Engine activation failed. |

## 5xxx — Localization

| Code | Slug | Message |
|------|------|---------|
| 5001 | LocaleGenericError | An unexpected error occured during locale operation. |
| 5002 | LocaleInvalidNamespace | Invalid locale or namespace. |

## 6xxx — Pages（最常用）

| Code | Slug | Message |
|------|------|---------|
| 6001 | PageGenericError | An unexpected error occured during a page operation. |
| 6002 | PageDuplicateCreate | Cannot create this page — entry already exists at the same path. |
| 6003 | PageNotFound | This page does not exist. |
| 6004 | PageEmptyContent | Page content cannot be empty. |
| 6005 | PageIllegalPath | Page path cannot contain illegal characters. |
| 6006 | PagePathCollision | Destination page path already exists. |
| 6007 | PageMoveForbidden | You are not authorized to move this page. |
| 6008 | PageCreateForbidden | You are not authorized to create this page. |
| 6009 | PageUpdateForbidden | You are not authorized to update this page. |
| **6010** | **PageDeleteForbidden** | **⚠️ 也用于 create/update 被 pageRules 拒绝时！错误码误导。** |
| 6011 | PageRestoreForbidden | You are not authorized to restore this page version. |
| 6012 | PageHistoryForbidden | You are not authorized to view the history of this page. |
| 6013 | PageViewForbidden | You are not authorized to view this page. |

## 7xxx — System

| Code | Slug | Message |
|------|------|---------|
| 7001 | SystemGenericError | An unexpected error occured. |
| 7002 | SystemSSLDisabled | SSL is not enabled. |
| 7003 | SystemSSLRenewInvalidProvider | Current provider does not support SSL certificate renewal. |
| 7004 | SystemSSLLEUnavailable | Let's Encrypt is not initialized. |

## 8xxx — Comments

| Code | Slug | Message |
|------|------|---------|
| 8001 | CommentGenericError | An unexpected error occured. |
| 8002 | CommentPostForbidden | You are not authorized to post a comment on this page. |
| 8003 | CommentContentMissing | Comment content is missing or too short. |
| 8004 | CommentManageForbidden | You are not authorized to manage comments. |
| 8005 | CommentNotFound | This comment does not exist. |
| 8006 | CommentViewForbidden | You are not authorized to view comments for this page. |

## 常见错误速查（API Key 场景）

| 操作 | 成功 | 常见失败码 | 根因 |
|------|------|-----------|------|
| `pages.list` | 返回数组 | 无（空 `[]` = Forbidden） | Key 无效或静默降级 Guest |
| `pages.create` | errorCode=0 | 6002（重复）、6008/6010（权限） | 路径冲突 / pageRules 缺 write |
| `pages.update` | errorCode=0 | 6003（不存在）、6009/6010（权限） | ID 不存在 / pageRules 缺 write |
| `pages.delete` | errorCode=0 | 6010（权限） | 缺 delete:pages 或 manage:system |
| `pages.single` | 返回对象 | 6013（Forbidden） | pageRules 缺 read:source |
