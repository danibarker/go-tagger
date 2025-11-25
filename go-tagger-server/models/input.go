package models

// BatchTagInput defines the expected JSON payload for the bulk tagging API.
// This is what the SolidJS frontend will send.
type BatchTagInput struct {
	// PhotoIDs is the list of unique database IDs of the selected photos.
	PhotoIDs []uint `json:"photo_ids" binding:"required"`

	// NewTags is the list of tags to add to all selected photos.
	NewTags []string `json:"new_tags" binding:"required"`
}

type PaginationInput struct {
	Page        int    `form:"page,default=1"`
	Limit       int    `form:"limit,default=50"`
	Tags        string `form:"tags"`
	TagsOrAnd   string `form:"tags_or_and,default=and"` // and or or
	Name        string `form:"name"`
	FileType    string `form:"file_type,default=any"` // any, image or video
	BeforeDate  string `form:"before_date"`
	BeforeTime  string `form:"before_time"`
	AfterDate   string `form:"after_date"`
	AfterTime   string `form:"after_time"`
	People      string `form:"people"`
	PeopleOrAnd string `form:"people_or_and,default=and"` // and or or
}
