from uuid import UUID

from pydantic import Field

from app.schemas.common import Schema


class FollowStatus(Schema):
    user_id: UUID
    following: bool = Field(description="The current user follows this user")
    followed_by: bool = Field(description="This user follows the current user")
    is_friend: bool = Field(description="Mutual follow")
