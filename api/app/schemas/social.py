from uuid import UUID

from pydantic import BaseModel, Field


class FollowStatus(BaseModel):
    user_id: UUID
    following: bool = Field(description="The current user follows this user")
    followed_by: bool = Field(description="This user follows the current user")
    is_friend: bool = Field(description="Mutual follow")
